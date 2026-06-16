const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase env vars.");
  process.exit(1);
}

const updates = new Map([
  ["6897a717-6d8e-4617-b9e6-c1b96db228e2", { scheduled_date: "2026-06-20", location: "Arena Seven", court_name: "Quadra B", local_time: "09:20" }],
  ["362b09e9-7880-4739-b9af-92845aa2d7f5", { scheduled_date: "2026-06-21", location: "Arena Seven", court_name: "Quadra B", local_time: "08:00" }],
  ["5715e7b3-5d7c-4223-b7a2-0e1d41d0b7db", { scheduled_date: "2026-06-21", location: "Arena Seven", court_name: "Quadra B", local_time: "08:40" }],
  ["f328e865-f6ec-457a-b096-0f43926ec650", { scheduled_date: "2026-06-21", location: "Arena Seven", court_name: "Quadra A", local_time: "08:00" }],
  ["df051680-977b-415c-b427-e2043edd971d", { scheduled_date: "2026-06-21", location: "Arena Seven", court_name: "Quadra A", local_time: "08:40" }],
  ["7f6990ef-6ee7-4847-bcdf-d117179150e9", { scheduled_date: "2026-06-21", location: "Arena Seven", court_name: "Quadra A", local_time: "09:20" }],
  ["3090dafa-19c3-4341-a63a-96d9c0ef8921", { scheduled_date: "2026-06-21", location: "Arena Seven", court_name: "Quadra A", local_time: "10:00" }],
  ["04b2a76a-a5ab-4d3a-9f17-0a29a447ecbf", { scheduled_date: "2026-06-21", location: "Arena Seven", court_name: "Quadra A", local_time: "10:40" }],
  ["7309473e-c99c-4a14-bb0a-c70a45f499f0", { scheduled_date: "2026-06-21", location: "Arena Seven", court_name: "Quadra A", local_time: "11:20" }],
  ["1de48bbc-c2d7-4c9d-9b62-a30b4ba1950f", { scheduled_date: "2026-06-21", location: "Arena Seven", court_name: "Quadra A", local_time: "13:00" }],
  ["b946aa22-fdbc-4017-a635-6569673e6434", { scheduled_date: "2026-06-21", location: "Arena Seven", court_name: "Quadra B", local_time: "13:40" }],
  ["296efc7c-464f-4810-bb37-a7d1be2d8b67", { scheduled_date: "2026-06-21", location: "Arena Seven", court_name: "Quadra B", local_time: "15:40" }],
]);

function localTimeToIso(date, localTime) {
  return `${date}T${localTime}:00-03:00`;
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
    "naipe",
    "division",
    "sport_id",
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
const nextMatches = matches.map((match) => {
  const update = updates.get(match.id);

  if (!update) {
    return match;
  }

  return {
    ...match,
    scheduled_date: update.scheduled_date,
    location: update.location,
    court_name: update.court_name,
    start_time: localTimeToIso(update.scheduled_date, update.local_time),
  };
});

const normalize = (value) => (value || "").trim().toLowerCase();
const sameTeams = (firstMatch, secondMatch) => {
  const firstTeams = [firstMatch.home_team_id, firstMatch.away_team_id].filter(Boolean);
  const secondTeams = new Set([secondMatch.home_team_id, secondMatch.away_team_id].filter(Boolean));
  return firstTeams.some((teamId) => secondTeams.has(teamId));
};

const sameCourtConflicts = [];
const groupedByCourt = new Map();

for (const match of nextMatches) {
  const key = [match.scheduled_date, normalize(match.location), normalize(match.court_name)].join("::");
  if (!groupedByCourt.has(key)) groupedByCourt.set(key, []);
  groupedByCourt.get(key).push(match);
}

for (const scopedMatches of groupedByCourt.values()) {
  scopedMatches.sort((firstMatch, secondMatch) => {
    if (firstMatch.start_time !== secondMatch.start_time) {
      return firstMatch.start_time.localeCompare(secondMatch.start_time);
    }
    return firstMatch.id.localeCompare(secondMatch.id);
  });

  for (let firstIndex = 0; firstIndex < scopedMatches.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < scopedMatches.length; secondIndex += 1) {
      const firstMatch = scopedMatches[firstIndex];
      const secondMatch = scopedMatches[secondIndex];
      if (secondMatch.naipe !== firstMatch.naipe) continue;
      if (Math.abs(secondIndex - firstIndex) >= 4) continue;
      if (!sameTeams(firstMatch, secondMatch)) continue;
      sameCourtConflicts.push({
        type: "same_court",
        first: `${firstMatch.scheduled_date} ${firstMatch.court_name} ${firstMatch.home_team?.name} x ${firstMatch.away_team?.name} ${firstMatch.naipe}`,
        second: `${secondMatch.scheduled_date} ${secondMatch.court_name} ${secondMatch.home_team?.name} x ${secondMatch.away_team?.name} ${secondMatch.naipe}`,
      });
    }
  }
}

const crossCourtConflicts = [];

for (let firstIndex = 0; firstIndex < nextMatches.length; firstIndex += 1) {
  for (let secondIndex = firstIndex + 1; secondIndex < nextMatches.length; secondIndex += 1) {
    const firstMatch = nextMatches[firstIndex];
    const secondMatch = nextMatches[secondIndex];
    if (firstMatch.scheduled_date !== secondMatch.scheduled_date) continue;
    if (firstMatch.naipe !== secondMatch.naipe) continue;
    if (!sameTeams(firstMatch, secondMatch)) continue;
    if (
      normalize(firstMatch.location) === normalize(secondMatch.location) &&
      normalize(firstMatch.court_name) === normalize(secondMatch.court_name)
    ) {
      continue;
    }

    const diffInMinutes = Math.abs(new Date(secondMatch.start_time).getTime() - new Date(firstMatch.start_time).getTime()) / 60000;
    if (diffInMinutes >= 140) continue;

    crossCourtConflicts.push({
      type: "cross_court",
      first: `${firstMatch.scheduled_date} ${firstMatch.court_name} ${firstMatch.home_team?.name} x ${firstMatch.away_team?.name} ${firstMatch.naipe} ${firstMatch.start_time}`,
      second: `${secondMatch.scheduled_date} ${secondMatch.court_name} ${secondMatch.home_team?.name} x ${secondMatch.away_team?.name} ${secondMatch.naipe} ${secondMatch.start_time}`,
      diffInMinutes,
    });
  }
}

console.log(JSON.stringify({ sameCourtConflicts, crossCourtConflicts }, null, 2));
