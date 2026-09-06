import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260906185235_optimize_standings_rebuild_and_realtime_load.sql",
  ),
  "utf8",
);

describe("standings rebuild performance migration", () => {
  it("persists only changed standings instead of replacing the complete scope", () => {
    expect(migration).toContain("expected_standings AS MATERIALIZED");
    expect(migration).toContain("updated_standings AS");
    expect(migration).toContain("inserted_standings AS");
    expect(migration).toContain("IS DISTINCT FROM");
    expect(migration).not.toContain("BEGIN\n  DELETE FROM public.standings AS standings_table\n  WHERE");
  });

  it("rebuilds a finished match once when its scope is unchanged", () => {
    expect(migration).toContain("IF NOT scope_changed AND NOT classification_changed THEN");
    expect(migration).toContain("IF scope_changed THEN");
    expect(migration).toContain("AFTER INSERT OR DELETE OR UPDATE OF");
  });

  it("includes score, discipline, walkover and tie-break inputs in the selective trigger", () => {
    expect(migration).toContain("resolved_tie_break_winner_team_id");
    expect(migration).toContain("is_double_walkover");
    expect(migration).toContain("home_blue_cards");
    expect(migration).toContain("away_two_minute_penalties");
  });
});
