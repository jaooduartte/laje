import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907213534_restore_knockout_progression_and_futsal_semifinals.sql",
  ),
  "utf8",
);

describe("restore knockout progression and futsal semifinals migration", () => {
  it("propagates knockout winners instead of regenerating the bracket", () => {
    expect(migrationSource).toContain(
      "PERFORM public.propagate_championship_knockout_progress(NEW.id);",
    );
    expect(migrationSource).not.toContain(
      "IF should_propagate_knockout_progress THEN\n    PERFORM public.generate_championship_knockout_for_competition",
    );
  });

  it("uses the penalty result as the winner source for eligible knockout sports", () => {
    expect(migrationSource).toContain(
      "sports_table.code IN ('FUTEBOL_SOCIETY', 'BEACH_SOCCER', 'FUTSAL')",
    );
    expect(migrationSource).toContain("THEN matches_table.away_team_id");
    expect(migrationSource).toContain(
      "NEW.resolved_tie_break_winner_team_id := CASE",
    );
  });

  it("reprocesses only the completed futsal male quarterfinals", () => {
    expect(migrationSource).not.toContain("c984096a-ebd3-44f3-ba95-256f2b564cb0");
    expect(migrationSource).toContain("bracket_matches_table.round_number = 1");
    expect(migrationSource).toContain("IF propagated_match_count <> 4 THEN");
  });
});
