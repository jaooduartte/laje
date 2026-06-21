import fs from "node:fs/promises";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase env vars.");
  process.exit(1);
}

const MATCH_DISPLAY_TIME_ZONE = "America/Sao_Paulo";
const MATCH_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: MATCH_DISPLAY_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const scheduleSql = await fs.readFile(
  new URL("../supabase/migrations/20260621131500_apply_society_2026_official_schedule_matrix.sql", import.meta.url),
  "utf8",
);

const officialRowPattern =
  /\('([^']+)'::public\.bracket_phase,\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*(true|false),\s*'(\d{4}-\d{2}-\d{2})'::date,\s*'([^']+)',\s*'([^']+)',\s*time '(\d{2}:\d{2})',\s*(\d+),\s*(\d+),\s*'([^']+)'::public\.match_naipe,\s*'([^']+)'::public\.team_division,\s*(NULL|'[^']*'),\s*(NULL|'[^']*'),\s*(NULL|'[^']*')\)/g;

function unwrapSqlString(value) {
  if (!value || value === "NULL") {
    return null;
  }

  return value.slice(1, -1);
}

function buildOfficialKey(row) {
  return [
    row.scheduled_date,
    row.naipe,
    row.division,
    row.home_team_name ?? "NULL_HOME",
    row.away_team_name ?? "NULL_AWAY",
  ].join("|");
}

function buildOfficialSlotKey(row) {
  return [
    row.scheduled_date,
    row.location,
    row.court_name,
    String(row.scheduled_slot),
    String(row.queue_position),
    row.naipe,
    row.division,
  ].join("|");
}

const officialRows = [];
for (const match of scheduleSql.matchAll(officialRowPattern)) {
  const row = {
    phase: match[1],
    scheduled_date: match[6],
    location: match[7],
    court_name: match[8],
    planned_start_time: match[9],
    scheduled_slot: Number(match[10]),
    queue_position: Number(match[11]),
    naipe: match[12],
    division: match[13],
    home_team_name: unwrapSqlString(match[14]),
    away_team_name: unwrapSqlString(match[15]),
    sheet_representation: unwrapSqlString(match[16]),
  };

  if (!["2026-06-20", "2026-06-21"].includes(row.scheduled_date)) {
    continue;
  }

  officialRows.push(row);
}

const officialMaterializedRows = officialRows.filter(
  (row) => row.home_team_name && row.away_team_name,
);

const officialRowsByKey = new Map(
  officialMaterializedRows.map((row) => [buildOfficialKey(row), row]),
);
const officialRowsBySlotKey = new Map(
  officialRows.map((row) => [buildOfficialSlotKey(row), row]),
);

const url = new URL(`${SUPABASE_URL}/rest/v1/matches`);
url.searchParams.set(
  "select",
  [
    "id",
    "status",
    "scheduled_date",
    "location",
    "court_name",
    "start_time",
    "end_time",
    "scheduled_slot",
    "queue_position",
    "created_at",
    "manual_representation_mode",
    "naipe",
    "division",
    "home_score",
    "away_score",
    "home_team:teams!matches_home_team_id_fkey(id,name)",
    "away_team:teams!matches_away_team_id_fkey(id,name)",
  ].join(","),
);
url.searchParams.set("championship_id", "eq.17b92cf5-dd92-44eb-9295-b28000372e4b");
url.searchParams.set("season_year", "eq.2026");
url.searchParams.set("sport_id", "eq.753bee02-fc22-4c72-8d7f-70adaa5e4a6b");
url.searchParams.set("scheduled_date", "in.(2026-06-20,2026-06-21)");
url.searchParams.set(
  "order",
  "scheduled_date.asc,location.asc,court_name.asc,scheduled_slot.asc.nullslast,queue_position.asc.nullslast,created_at.asc,id.asc",
);
url.searchParams.set("limit", "200");

const response = await fetch(url, {
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Accept: "application/json",
  },
});

if (!response.ok) {
  console.error(response.status, await response.text());
  process.exit(1);
}

const matches = await response.json();

function resolveLocalTime(isoDateTime) {
  if (!isoDateTime) {
    return null;
  }

  return MATCH_TIME_FORMATTER.format(new Date(isoDateTime));
}

function buildActualKey(match) {
  return [
    match.scheduled_date,
    match.naipe,
    match.division,
    match.home_team?.name ?? "NULL_HOME",
    match.away_team?.name ?? "NULL_AWAY",
  ].join("|");
}

function buildActualSlotKey(match) {
  return [
    match.scheduled_date,
    match.location,
    match.court_name,
    String(match.scheduled_slot),
    String(match.queue_position),
    match.naipe,
    match.division,
  ].join("|");
}

function resolveScopeKey(match) {
  return [
    match.scheduled_date,
    match.location?.trim() ?? "",
    match.court_name?.trim() ?? "",
  ].join("|");
}

function resolveDisplayRepresentation(previousMatch, currentMatch) {
  if (currentMatch.manual_representation_mode === "CO") {
    return "CO";
  }

  if (!previousMatch || previousMatch.scheduled_date !== currentMatch.scheduled_date) {
    return "CO";
  }

  const previousHomeName = previousMatch.home_team?.name?.trim();
  const previousAwayName = previousMatch.away_team?.name?.trim();

  if (!previousHomeName || !previousAwayName) {
    return "A definir";
  }

  return `${previousHomeName} x ${previousAwayName}`;
}

const mismatches = [];
const extraMatches = [];
const missingMatches = [];
const strangeScheduledTimes = [];
const representationMismatches = [];
const preservedCompletedMatchTimes = [];

const matchesByScope = matches.reduce((carry, match) => {
  const scopeKey = resolveScopeKey(match);
  carry.set(scopeKey, [...(carry.get(scopeKey) ?? []), match]);
  return carry;
}, new Map());

for (const scopedMatches of matchesByScope.values()) {
  scopedMatches.forEach((match, index) => {
    match.computed_representation = resolveDisplayRepresentation(scopedMatches[index - 1], match);
  });
}

const matchedOfficialKeys = new Set();

for (const match of matches) {
  const actualKey = buildActualKey(match);
  const officialRow = officialRowsByKey.get(actualKey) ?? officialRowsBySlotKey.get(buildActualSlotKey(match));

  if (!officialRow) {
    extraMatches.push({
      id: match.id,
      status: match.status,
      scheduled_date: match.scheduled_date,
      court_name: match.court_name,
      scheduled_slot: match.scheduled_slot,
      queue_position: match.queue_position,
      home: match.home_team?.name ?? null,
      away: match.away_team?.name ?? null,
    });
    continue;
  }

  matchedOfficialKeys.add(actualKey);

  if (
    match.scheduled_date !== officialRow.scheduled_date ||
    match.location !== officialRow.location ||
    match.court_name !== officialRow.court_name ||
    match.scheduled_slot !== officialRow.scheduled_slot ||
    match.queue_position !== officialRow.queue_position
  ) {
    mismatches.push({
      id: match.id,
      status: match.status,
      teams: `${match.home_team?.name ?? "?"} x ${match.away_team?.name ?? "?"}`,
      actual: {
        scheduled_date: match.scheduled_date,
        location: match.location,
        court_name: match.court_name,
        scheduled_slot: match.scheduled_slot,
        queue_position: match.queue_position,
      },
      expected: {
        scheduled_date: officialRow.scheduled_date,
        location: officialRow.location,
        court_name: officialRow.court_name,
        scheduled_slot: officialRow.scheduled_slot,
        queue_position: officialRow.queue_position,
      },
    });
  }

  const actualLocalTime = resolveLocalTime(match.start_time);
  if (match.status === "SCHEDULED") {
    if (actualLocalTime !== officialRow.planned_start_time) {
      mismatches.push({
        id: match.id,
        status: match.status,
        teams: `${match.home_team?.name ?? "?"} x ${match.away_team?.name ?? "?"}`,
        actual: { planned_start_time: actualLocalTime },
        expected: { planned_start_time: officialRow.planned_start_time },
      });
    }

    if (!/^(08:00|08:40|09:20|10:00|10:40|11:20|13:00|13:40|14:20|15:00|15:45|16:30|17:15|18:00|18:20|19:00|19:40|20:20)$/.test(actualLocalTime ?? "")) {
      strangeScheduledTimes.push({
        id: match.id,
        teams: `${match.home_team?.name ?? "?"} x ${match.away_team?.name ?? "?"}`,
        planned_start_time: actualLocalTime,
      });
    }
  } else {
    preservedCompletedMatchTimes.push({
      id: match.id,
      status: match.status,
      teams: `${match.home_team?.name ?? "?"} x ${match.away_team?.name ?? "?"}`,
      real_start_time: actualLocalTime,
    });
  }

  if (officialRow.sheet_representation && match.computed_representation !== officialRow.sheet_representation) {
    representationMismatches.push({
      id: match.id,
      teams: `${match.home_team?.name ?? "?"} x ${match.away_team?.name ?? "?"}`,
      court_name: match.court_name,
      scheduled_slot: match.scheduled_slot,
      actual: match.computed_representation,
      expected: officialRow.sheet_representation,
    });
  }
}

for (const [officialKey, officialRow] of officialRowsByKey.entries()) {
  if (!matchedOfficialKeys.has(officialKey)) {
    missingMatches.push({
      scheduled_date: officialRow.scheduled_date,
      court_name: officialRow.court_name,
      scheduled_slot: officialRow.scheduled_slot,
      queue_position: officialRow.queue_position,
      teams: `${officialRow.home_team_name} x ${officialRow.away_team_name}`,
    });
  }
}

console.log(
  JSON.stringify(
    {
      summary: {
        fetched_matches: matches.length,
        official_materialized_rows: officialMaterializedRows.length,
        matched_official_rows: matchedOfficialKeys.size,
        mismatch_count: mismatches.length,
        extra_match_count: extraMatches.length,
        missing_match_count: missingMatches.length,
        strange_scheduled_time_count: strangeScheduledTimes.length,
        representation_mismatch_count: representationMismatches.length,
        completed_or_live_matches_checked: preservedCompletedMatchTimes.length,
      },
      mismatches,
      extra_matches: extraMatches,
      missing_matches: missingMatches,
      strange_scheduled_times: strangeScheduledTimes,
      representation_mismatches: representationMismatches,
      completed_or_live_matches_checked: preservedCompletedMatchTimes,
    },
    null,
    2,
  ),
);
