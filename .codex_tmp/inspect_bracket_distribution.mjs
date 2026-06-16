const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase env vars.");
  process.exit(1);
}

async function fetchJson(path, searchParams) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);

  Object.entries(searchParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    console.error(path, response.status, await response.text());
    process.exit(1);
  }

  return response.json();
}

const sportId = "753bee02-fc22-4c72-8d7f-70adaa5e4a6b";
const bracketEditionId = "a63df7b3-752e-421a-bf08-dcebeef99643";
const championshipId = "17b92cf5-dd92-44eb-9295-b28000372e4b";

const [days, locations, courts, courtSports, locationPriorities, matches] = await Promise.all([
  fetchJson("championship_bracket_days", {
    select: "id,bracket_edition_id,event_date,start_time,end_time",
    bracket_edition_id: `eq.${bracketEditionId}`,
    order: "event_date.asc,start_time.asc",
  }),
  fetchJson("championship_bracket_locations", {
    select: "id,bracket_day_id,location_group_id,name,position",
    order: "position.asc,name.asc",
  }),
  fetchJson("championship_bracket_courts", {
    select: "id,bracket_location_id,court_group_id,name,position",
    order: "position.asc,name.asc",
  }),
  fetchJson("championship_bracket_court_sports", {
    select: "id,bracket_court_id,sport_id,preferred_naipe,preferred_division",
    sport_id: `eq.${sportId}`,
  }),
  fetchJson("championship_bracket_location_sport_priorities", {
    select: "bracket_edition_id,location_group_id,sport_id,priority_mode",
    bracket_edition_id: `eq.${bracketEditionId}`,
    sport_id: `eq.${sportId}`,
  }),
  fetchJson("matches", {
    select: "id,scheduled_date,location,court_name,start_time,scheduled_slot,queue_position,naipe,division,home_team:teams!matches_home_team_id_fkey(name),away_team:teams!matches_away_team_id_fkey(name)",
    championship_id: `eq.${championshipId}`,
    season_year: "eq.2026",
    sport_id: `eq.${sportId}`,
    status: "eq.SCHEDULED",
    order: "scheduled_date.asc,start_time.asc.nullslast,scheduled_slot.asc.nullslast,queue_position.asc.nullslast",
    limit: "200",
  }),
]);

const locationById = new Map(locations.map((location) => [location.id, location]));
const dayById = new Map(days.map((day) => [day.id, day]));

const courtSummary = courts
  .map((court) => {
    const location = locationById.get(court.bracket_location_id);
    const day = location ? dayById.get(location.bracket_day_id) : null;
    const sportPreference = courtSports.find((entry) => entry.bracket_court_id === court.id) ?? null;

    return {
      event_date: day?.event_date ?? null,
      location_name: location?.name ?? null,
      court_name: court.name,
      location_position: location?.position ?? null,
      court_position: court.position,
      location_group_id: location?.location_group_id ?? null,
      court_group_id: court.court_group_id,
      preferred_naipe: sportPreference?.preferred_naipe ?? null,
      preferred_division: sportPreference?.preferred_division ?? null,
    };
  })
  .filter((court) => court.event_date != null);

console.log(
  JSON.stringify(
    {
      days,
      courtSummary,
      locationPriorities,
      matches: matches.map((match) => ({
        scheduled_date: match.scheduled_date,
        location: match.location,
        court_name: match.court_name,
        start_time: match.start_time,
        scheduled_slot: match.scheduled_slot,
        queue_position: match.queue_position,
        naipe: match.naipe,
        division: match.division,
        label: `${match.home_team?.name ?? "?"} x ${match.away_team?.name ?? "?"}`,
      })),
    },
    null,
    2,
  ),
);
