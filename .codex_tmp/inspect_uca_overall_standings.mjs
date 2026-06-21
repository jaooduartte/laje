import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

try {
  const championship = await sql`
    select id
    from public.championships
    where code = 'SOCIETY'
    limit 1
  `;

  const championshipId = championship[0]?.id;

  const ucaStandings = await sql`
    select
      standings_table.team_id,
      teams_table.name as team_name,
      standings_table.sport_id,
      sports_table.name as sport_name,
      standings_table.naipe,
      standings_table.division,
      standings_table.played,
      standings_table.wins,
      standings_table.draws,
      standings_table.losses,
      standings_table.goals_for,
      standings_table.goals_against,
      standings_table.goal_diff,
      standings_table.points
    from public.standings as standings_table
    join public.teams as teams_table on teams_table.id = standings_table.team_id
    join public.sports as sports_table on sports_table.id = standings_table.sport_id
    where standings_table.championship_id = ${championshipId}
      and standings_table.season_year = 2026
      and teams_table.name = 'UCA'
    order by sports_table.name, standings_table.naipe, standings_table.division nulls first
  `;

  const ucaOverall = await sql`
    select
      standings_table.team_id,
      teams_table.name as team_name,
      sum(standings_table.points) as total_points,
      sum(standings_table.played) as total_played,
      sum(standings_table.wins) as total_wins,
      sum(standings_table.draws) as total_draws,
      sum(standings_table.losses) as total_losses,
      sum(standings_table.goals_for) as total_goals_for,
      sum(standings_table.goals_against) as total_goals_against,
      sum(standings_table.goal_diff) as total_goal_diff
    from public.standings as standings_table
    join public.teams as teams_table on teams_table.id = standings_table.team_id
    where standings_table.championship_id = ${championshipId}
      and standings_table.season_year = 2026
      and teams_table.name = 'UCA'
    group by standings_table.team_id, teams_table.name
  `;

  console.log(JSON.stringify({ ucaStandings, ucaOverall }, null, 2));
} finally {
  await sql.end();
}
