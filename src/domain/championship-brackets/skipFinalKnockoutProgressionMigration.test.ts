import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260919131840_skip_final_knockout_progression.sql",
  ),
  "utf8",
);

describe("skip final knockout progression migration", () => {
  it("does not try to progress a final without a structural successor", () => {
    expect(migrationSource).toContain(
      "bracket_matches_table.next_bracket_match_id",
    );
    expect(migrationSource).toMatch(
      /IF current_bracket_match\.next_bracket_match_id IS NOT NULL THEN[\s\S]*PERFORM public\.ensure_championship_knockout_next_round_match\([\s\S]*PERFORM public\.ensure_championship_knockout_third_place_match\([\s\S]*END IF;/,
    );
  });

  it("keeps the winner and the edition status in sync", () => {
    expect(migrationSource).toContain("winner_team_id = resolved_winner_team_id");
    expect(migrationSource).toContain(
      "PERFORM public.sync_championship_bracket_edition_status(current_bracket_match.bracket_edition_id);",
    );
  });
});
