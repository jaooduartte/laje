const url = new URL(`${process.env.VITE_SUPABASE_URL}/rest/v1/matches`);
url.searchParams.set("select", "id,championship_id,season_year,scheduled_date,location,court_name,start_time,scheduled_slot,queue_position,created_at,status,home_team:teams!matches_home_team_id_fkey(id,name),away_team:teams!matches_away_team_id_fkey(id,name)");
url.searchParams.set("status", "eq.SCHEDULED");
url.searchParams.set("scheduled_date", "not.is.null");
url.searchParams.set("location", "not.is.null");
url.searchParams.set("court_name", "not.is.null");
url.searchParams.set("order", "scheduled_date.asc,start_time.asc.nullslast,scheduled_slot.asc.nullslast,queue_position.asc.nullslast,created_at.asc,id.asc");
url.searchParams.set("limit", "1000");
const response = await fetch(url, {
  headers: {
    apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${process.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    Accept: "application/json",
  },
});
if (!response.ok) {
  console.error(response.status, await response.text());
  process.exit(1);
}
const matches = await response.json();
const groups = new Map();
for (const match of matches) {
  const key = [match.championship_id, match.season_year, match.scheduled_date, (match.location || "").trim().toLowerCase(), (match.court_name || "").trim().toLowerCase()].join("::");
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(match);
}
const conflicts = [];
for (const [key, scopedMatches] of groups.entries()) {
  scopedMatches.sort((a, b) => {
    const aHasStart = a.start_time ? 0 : 1;
    const bHasStart = b.start_time ? 0 : 1;
    if (aHasStart !== bHasStart) return aHasStart - bHasStart;
    if (a.start_time && b.start_time && a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
    const aSlot = a.scheduled_slot ?? a.queue_position ?? Number.MAX_SAFE_INTEGER;
    const bSlot = b.scheduled_slot ?? b.queue_position ?? Number.MAX_SAFE_INTEGER;
    if (aSlot !== bSlot) return aSlot - bSlot;
    const aQueue = a.queue_position ?? a.scheduled_slot ?? Number.MAX_SAFE_INTEGER;
    const bQueue = b.queue_position ?? b.scheduled_slot ?? Number.MAX_SAFE_INTEGER;
    if (aQueue !== bQueue) return aQueue - bQueue;
    if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
    return a.id.localeCompare(b.id);
  });
  for (let index = 1; index < scopedMatches.length; index += 1) {
    const previous = scopedMatches[index - 1];
    const current = scopedMatches[index];
    const previousTeamIds = [previous.home_team?.id, previous.away_team?.id].filter(Boolean);
    const currentTeamIds = new Set([current.home_team?.id, current.away_team?.id].filter(Boolean));
    if (previousTeamIds.some((teamId) => currentTeamIds.has(teamId))) {
      conflicts.push({
        scheduled_date: current.scheduled_date,
        location: current.location,
        court_name: current.court_name,
        previous_match_id: previous.id,
        previous_label: `${previous.home_team?.name ?? "?"} x ${previous.away_team?.name ?? "?"}`,
        previous_queue_position: previous.queue_position,
        previous_scheduled_slot: previous.scheduled_slot,
        current_match_id: current.id,
        current_label: `${current.home_team?.name ?? "?"} x ${current.away_team?.name ?? "?"}`,
        current_queue_position: current.queue_position,
        current_scheduled_slot: current.scheduled_slot,
      });
    }
  }
}
console.log(JSON.stringify({ total_matches: matches.length, total_conflicts: conflicts.length, conflicts }, null, 2));
