const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase env vars.");
  process.exit(1);
}

const url = new URL(`${SUPABASE_URL}/rest/v1/matches`);
url.searchParams.set(
  "select",
  [
    "id",
    "scheduled_date",
    "location",
    "court_name",
    "start_time",
    "scheduled_slot",
    "queue_position",
    "naipe",
    "division",
    "home_team_id",
    "away_team_id",
    "home_team:teams!matches_home_team_id_fkey(id,name)",
    "away_team:teams!matches_away_team_id_fkey(id,name)",
  ].join(","),
);
url.searchParams.set("championship_id", "eq.17b92cf5-dd92-44eb-9295-b28000372e4b");
url.searchParams.set("season_year", "eq.2026");
url.searchParams.set("sport_id", "eq.753bee02-fc22-4c72-8d7f-70adaa5e4a6b");
url.searchParams.set("status", "eq.SCHEDULED");
url.searchParams.set("scheduled_date", "in.(2026-06-20,2026-06-21)");
url.searchParams.set(
  "order",
  "scheduled_date.asc,location.asc,court_name.asc,start_time.asc.nullslast,scheduled_slot.asc.nullslast,queue_position.asc.nullslast,id.asc",
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

for (const match of matches) {
  console.log(
    [
      match.scheduled_date,
      match.location,
      match.court_name,
      match.start_time,
      `slot=${match.scheduled_slot ?? "null"}`,
      `queue=${match.queue_position ?? "null"}`,
      match.naipe,
      match.division,
      match.id,
      `${match.home_team?.name ?? "?"} x ${match.away_team?.name ?? "?"}`,
    ].join(" | "),
  );
}
