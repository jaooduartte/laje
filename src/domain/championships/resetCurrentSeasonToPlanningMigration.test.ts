import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261107010000_fix_season_reset_bracket_match_delete_order.sql",
  ),
  "utf8",
);

describe("reset current championship season migration", () => {
  it("validates current season and blocks resetting a finished championship", () => {
    expect(migration).toContain(
      "_season_year IS DISTINCT FROM championship_record.current_season_year",
    );
    expect(migration).toContain(
      "championship_record.status = 'FINISHED'::public.championship_status",
    );
    expect(migration).toContain(
      "championship_record.status = 'PLANNING'::public.championship_status",
    );
  });

  it("rolls back on division conflicts and removes season-scoped operational data", () => {
    expect(migration).toContain("current_division IS DISTINCT FROM movement_record.next_division");
    expect(migration).toContain("('championship_bracket_preview_private', 'jobs'");
    expect(migration).not.toContain("match_award_goalkeepers");
    expect(migration).toContain("match_two_minute_penalty_players");
    expect(migration).toContain(
      "('public', 'matches', 'championship_id = $1 AND season_year = $2')",
    );
    expect(migration.indexOf("('public', 'championship_bracket_matches'")).toBeLessThan(
      migration.indexOf("('public', 'matches'"),
    );
    expect(migration).toContain(
      "('public', 'standings', 'championship_id = $1 AND season_year = $2')",
    );
    expect(migration).toContain("'championship_bracket_tie_break_resolution_teams'");
    expect(migration).toContain("'championship_bracket_day_breaks'");
    expect(migration).toContain("'championship_bracket_location_sport_priorities'");
    expect(migration).toContain("'championship_bracket_knockout_court_priorities'");
    expect(migration).toContain("format('DELETE FROM %I.%I WHERE %s'");
    expect(migration).not.toContain("DELETE FROM public.admin_action_logs");
    expect(migration).not.toMatch(/DELETE FROM public\.(championships|teams|sports)\b/i);
  });

  it("records the reset and only grants the RPC to authenticated users", () => {
    expect(migration).toContain("'championship_season_reset'");
    expect(migration).toContain("'deletedCounts', deleted_counts");
    expect(migration).toContain("'restoredTeamDivisionCount', restored_team_division_count");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.reset_championship_season_to_planning(UUID, INTEGER) FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.reset_championship_season_to_planning(UUID, INTEGER) TO authenticated",
    );
  });
});
