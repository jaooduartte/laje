import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
const query = `
with ordered_matches as (
  select
    m.id,
    m.scheduled_date,
    m.location,
    m.court_name,
    m.start_time,
    m.scheduled_slot,
    m.queue_position,
    m.home_team_id,
    m.away_team_id,
    ht.name as home_team_name,
    at.name as away_team_name,
    lag(m.id) over court_order as previous_match_id,
    lag(m.home_team_id) over court_order as previous_home_team_id,
    lag(m.away_team_id) over court_order as previous_away_team_id,
    lag(ht.name) over court_order as previous_home_team_name,
    lag(at.name) over court_order as previous_away_team_name
  from public.matches m
  left join public.teams ht on ht.id = m.home_team_id
  left join public.teams at on at.id = m.away_team_id
  where m.status = SCHEDULED
    and m.scheduled_date is not null
    and m.location is not null
    and m.court_name is not null
  window court_order as (
    partition by m.championship_id, m.season_year, m.scheduled_date, lower(trim(m.location)), lower(trim(m.court_name))
    order by
      case when m.start_time is null then 1 else 0 end,
      m.start_time asc nulls last,
      coalesce(m.scheduled_slot, m.queue_position) asc nulls last,
      coalesce(m.queue_position, m.scheduled_slot) asc nulls last,
      m.created_at asc,
      m.id asc
  )
)
select
  id,
  scheduled_date,
  location,
  court_name,
  queue_position,
  scheduled_slot,
  home_team_name,
  away_team_name,
  previous_match_id,
  previous_home_team_name,
  previous_away_team_name
from ordered_matches
where previous_match_id is not null
  and (
    previous_home_team_id in (home_team_id, away_team_id)
    or previous_away_team_id in (home_team_id, away_team_id)
  )
order by scheduled_date, location, court_name, coalesce(scheduled_slot, queue_position), id;
`;
const rows = await sql.unsafe(query);
console.log(JSON.stringify(rows, null, 2));
await sql.end();
