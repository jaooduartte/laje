import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.97.0";
import {
  buildCalendarDocument,
  resolveCalendarDescription,
  resolveETag,
  resolveMatchCalendarTitle,
  resolveScheduledSessionDateTime,
} from "./calendarIcs.ts";

type CalendarSubscriptionScope =
  | "MATCH"
  | "SESSION"
  | "SPORT_NAIPE"
  | "TEAM"
  | "TEAM_MATCHES"
  | "TEAM_SPORT_NAIPE";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  "";
const appUrl = Deno.env.get("APP_URL") ?? "https://laje.app";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supportedScopes = new Set<CalendarSubscriptionScope>([
  "MATCH",
  "SESSION",
  "SPORT_NAIPE",
  "TEAM",
  "TEAM_MATCHES",
  "TEAM_SPORT_NAIPE",
]);

function respond(status: number, body: string, headers: HeadersInit = {}) {
  return new Response(body, { status, headers });
}

function resolveLocation(location: string | null, courtName: string | null) {
  if (!location) {
    return courtName;
  }

  return courtName ? `${location} • ${courtName}` : location;
}

function resolveMatchEndTime(
  match: Record<string, unknown>,
  durationMinutes: number | null,
): string | null {
  const endTime = typeof match.end_time == "string" ? match.end_time : null;
  const startTime = typeof match.start_time == "string" ? match.start_time : null;

  if (endTime && startTime && new Date(endTime).getTime() > new Date(startTime).getTime()) {
    return endTime;
  }

  if (!startTime || !durationMinutes || durationMinutes <= 0) {
    return null;
  }

  return new Date(new Date(startTime).getTime() + durationMinutes * 60_000).toISOString();
}

function resolveNaipeLabel(naipe: string) {
  if (naipe == "MASCULINO") {
    return "Masculino";
  }

  if (naipe == "FEMININO") {
    return "Feminino";
  }

  return "Misto";
}

function resolveDivisionLabel(division: string | null) {
  if (division == "DIVISAO_PRINCIPAL") {
    return "Divisão Principal";
  }

  if (division == "DIVISAO_ACESSO") {
    return "Divisão de Acesso";
  }

  return null;
}

function isUuid(value: string | null): value is string {
  return value != null && uuidPattern.test(value);
}

function resolveRequiredSearchParameter(url: URL, key: string): string | null {
  const value = url.searchParams.get(key);
  return value?.trim() || null;
}

function resolveSaoPauloDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const valuesByType = parts.reduce<Record<string, string>>((carry, part) => {
    carry[part.type] = part.value;
    return carry;
  }, {});

  return `${valuesByType.year}-${valuesByType.month}-${valuesByType.day}`;
}

Deno.serve(async (request) => {
  if (request.method != "GET") {
    return respond(405, "Method not allowed", { Allow: "GET" });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return respond(500, "Calendar feed is not configured.");
  }

  const requestUrl = new URL(request.url);
  const scope = resolveRequiredSearchParameter(requestUrl, "scope") as CalendarSubscriptionScope | null;
  const championshipId = resolveRequiredSearchParameter(requestUrl, "championship_id");
  const seasonYear = Number(resolveRequiredSearchParameter(requestUrl, "season_year"));
  const matchId = resolveRequiredSearchParameter(requestUrl, "match_id");
  const sessionId = resolveRequiredSearchParameter(requestUrl, "session_id");
  const sportId = resolveRequiredSearchParameter(requestUrl, "sport_id");
  const naipe = resolveRequiredSearchParameter(requestUrl, "naipe");
  const teamId = resolveRequiredSearchParameter(requestUrl, "team_id");

  if (
    !scope ||
    !supportedScopes.has(scope) ||
    !isUuid(championshipId) ||
    !Number.isInteger(seasonYear) ||
    seasonYear < 2000 ||
    seasonYear > 2100 ||
    (scope == "MATCH" && !isUuid(matchId)) ||
    (scope == "SESSION" && !isUuid(sessionId)) ||
    (scope == "SPORT_NAIPE" && (!isUuid(sportId) || !naipe)) ||
    ((scope == "TEAM" || scope == "TEAM_MATCHES") && !isUuid(teamId)) ||
    (scope == "TEAM_SPORT_NAIPE" &&
      (!isUuid(teamId) || !isUuid(sportId) || !naipe))
  ) {
    return respond(400, "Invalid calendar subscription request.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: publicAccessSettings, error: publicAccessSettingsError } =
    await supabase
      .from("public_page_access_settings")
      .select("is_public_access_blocked, is_schedule_page_blocked")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

  if (publicAccessSettingsError) {
    console.error("calendar-public-access-check-failed", publicAccessSettingsError.message);
    return respond(500, "Unable to load calendar feed.");
  }

  if (
    publicAccessSettings?.is_public_access_blocked ||
    publicAccessSettings?.is_schedule_page_blocked
  ) {
    return respond(404, "Calendar feed not found.");
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const shouldIncludeMatches = scope != "SESSION";
  const shouldIncludeSessions =
    scope == "SESSION" || scope == "SPORT_NAIPE" || scope == "TEAM";
  let matches: Array<Record<string, unknown>> = [];
  let sessions: Array<Record<string, unknown>> = [];

  if (shouldIncludeMatches) {
    let matchesQuery = supabase
      .from("matches")
      .select(
        "id, championship_id, season_year, sport_id, naipe, division, location, court_name, start_time, end_time, status, is_pending_manual_relocation, created_at, updated_at, championships(name), sports(name), home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)",
      )
      .eq("championship_id", championshipId)
      .eq("season_year", seasonYear)
      .eq("status", "SCHEDULED")
      .eq("is_pending_manual_relocation", false)
      .not("start_time", "is", null)
      .gte("start_time", nowIso);

    if (scope == "MATCH") {
      matchesQuery = matchesQuery.eq("id", matchId);
    }

    if (scope == "SPORT_NAIPE") {
      matchesQuery = matchesQuery.eq("sport_id", sportId).eq("naipe", naipe);
    }

    if (scope == "TEAM" || scope == "TEAM_MATCHES") {
      matchesQuery = matchesQuery.or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);
    }

    if (scope == "TEAM_SPORT_NAIPE") {
      matchesQuery = matchesQuery
        .eq("sport_id", sportId)
        .eq("naipe", naipe)
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);
    }

    const { data, error } = await matchesQuery;

    if (error) {
      console.error("calendar-matches-load-failed", error.message);
      return respond(500, "Unable to load calendar feed.");
    }

    matches = (data ?? []) as Array<Record<string, unknown>>;
  }

  if (shouldIncludeSessions) {
    let sessionsQuery = supabase
      .from("championship_individual_sessions")
      .select(
        "id, championship_id, season_year, sport_id, naipe, division, scheduled_date, start_time, end_time, location_name, court_name, status, created_at, updated_at, sports(name)",
      )
      .eq("championship_id", championshipId)
      .eq("season_year", seasonYear)
      .eq("status", "SCHEDULED")
      .not("start_time", "is", null)
      .not("end_time", "is", null)
      .gte("scheduled_date", resolveSaoPauloDate(now));

    if (scope == "SESSION") {
      sessionsQuery = sessionsQuery.eq("id", sessionId);
    }

    if (scope == "SPORT_NAIPE") {
      sessionsQuery = sessionsQuery.eq("sport_id", sportId).eq("naipe", naipe);
    }

    const { data, error } = await sessionsQuery;

    if (error) {
      console.error("calendar-sessions-load-failed", error.message);
      return respond(500, "Unable to load calendar feed.");
    }

    sessions = ((data ?? []) as Array<Record<string, unknown>>).filter((session) => {
      const sessionStartTime = resolveScheduledSessionDateTime(
        typeof session.scheduled_date == "string" ? session.scheduled_date : null,
        typeof session.start_time == "string" ? session.start_time : null,
      );

      return sessionStartTime != null && new Date(sessionStartTime).getTime() >= now.getTime();
    });
  }

  if (scope == "TEAM") {
    const participantResults = await Promise.all(
      sessions.map(async (session) => {
        const { data, error } = await supabase.rpc(
          "get_championship_individual_session_participants",
          { _session_id: String(session.id) },
        );

        if (error) {
          throw error;
        }

        return {
          session,
          isParticipant: (data ?? []).some(
            (participant) => participant.team_id == teamId,
          ),
        };
      }),
    ).catch((error) => {
      console.error("calendar-session-participants-load-failed", error.message);
      return null;
    });

    if (!participantResults) {
      return respond(500, "Unable to load calendar feed.");
    }

    sessions = participantResults
      .filter(({ isParticipant }) => isParticipant)
      .map(({ session }) => session);
  }

  const championshipSportKeys = [
    ...new Set(
      matches.map((match) => `${match.championship_id}:${match.sport_id}`),
    ),
  ];
  const durationByChampionshipSportKey: Record<string, number> = {};

  if (championshipSportKeys.length > 0) {
    const { data, error } = await supabase
      .from("championship_sports")
      .select("championship_id, sport_id, default_match_duration_minutes")
      .eq("championship_id", championshipId);

    if (error) {
      console.error("calendar-match-duration-load-failed", error.message);
      return respond(500, "Unable to load calendar feed.");
    }

    (data ?? []).forEach((championshipSport) => {
      durationByChampionshipSportKey[
        `${championshipSport.championship_id}:${championshipSport.sport_id}`
      ] = championshipSport.default_match_duration_minutes;
    });
  }

  const matchEvents = matches.flatMap((match) => {
    const startTime = typeof match.start_time == "string" ? match.start_time : null;
    const endTime = resolveMatchEndTime(
      match,
      durationByChampionshipSportKey[`${match.championship_id}:${match.sport_id}`] ?? null,
    );
    const homeTeam = (match.home_team as { name?: string } | null)?.name ?? "Atlética da casa";
    const awayTeam = (match.away_team as { name?: string } | null)?.name ?? "Atlética visitante";
    const sportName = (match.sports as { name?: string } | null)?.name ?? "Modalidade";
    const championshipName = (match.championships as { name?: string } | null)?.name ?? "Campeonato";
    const divisionLabel = resolveDivisionLabel(
      typeof match.division == "string" ? match.division : null,
    );

    if (!startTime || !endTime) {
      return [];
    }

    return [
      {
        uid: `match-${match.id}@laje.app`,
        title: resolveMatchCalendarTitle(
          sportName,
          resolveNaipeLabel(String(match.naipe)),
          homeTeam,
          awayTeam,
        ),
        description: resolveCalendarDescription([
          championshipName,
          `Edição ${match.season_year}`,
          resolveNaipeLabel(String(match.naipe)),
          divisionLabel,
          `Agenda: ${appUrl}/agenda`,
        ]),
        location: resolveLocation(
          typeof match.location == "string" ? match.location : null,
          typeof match.court_name == "string" ? match.court_name : null,
        ),
        startTime,
        endTime,
        updatedAt:
          (typeof match.updated_at == "string" ? match.updated_at : null) ??
          String(match.created_at),
      },
    ];
  });
  const sessionEvents = sessions.flatMap((session) => {
    const scheduledDate = typeof session.scheduled_date == "string"
      ? session.scheduled_date
      : null;
    const startTime = resolveScheduledSessionDateTime(
      scheduledDate,
      typeof session.start_time == "string" ? session.start_time : null,
    );
    const endTime = resolveScheduledSessionDateTime(
      scheduledDate,
      typeof session.end_time == "string" ? session.end_time : null,
    );
    const sportName = (session.sports as { name?: string } | null)?.name ?? "Modalidade individual";
    const divisionLabel = resolveDivisionLabel(
      typeof session.division == "string" ? session.division : null,
    );

    if (!startTime || !endTime || new Date(endTime).getTime() <= new Date(startTime).getTime()) {
      return [];
    }

    return [
      {
        uid: `session-${session.id}@laje.app`,
        title: `LAJE · Sessão de ${sportName} — ${resolveNaipeLabel(String(session.naipe))}`,
        description: resolveCalendarDescription([
          "Sessão individual",
          `Edição ${session.season_year}`,
          resolveNaipeLabel(String(session.naipe)),
          divisionLabel,
          `Agenda: ${appUrl}/agenda`,
        ]),
        location: resolveLocation(
          typeof session.location_name == "string" ? session.location_name : null,
          typeof session.court_name == "string" ? session.court_name : null,
        ),
        startTime,
        endTime,
        updatedAt:
          (typeof session.updated_at == "string" ? session.updated_at : null) ??
          String(session.created_at),
      },
    ];
  });
  const calendar = buildCalendarDocument(
    [...matchEvents, ...sessionEvents].sort((firstEvent, secondEvent) =>
      firstEvent.startTime.localeCompare(secondEvent.startTime),
    ),
  );
  const etag = await resolveETag(calendar);

  if (request.headers.get("if-none-match") == etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, max-age=300" },
    });
  }

  return respond(200, calendar, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": requestUrl.searchParams.get("download") == "1"
      ? "attachment; filename=laje-agenda.ics"
      : "inline; filename=laje-agenda.ics",
    "Cache-Control": "private, max-age=300",
    ETag: etag,
  });
});
