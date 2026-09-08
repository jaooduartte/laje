import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260908154012_align_knockout_bracket_view_with_linked_matches.sql",
  ),
  "utf8",
);

describe("align knockout bracket view with linked matches migration", () => {
  it("uses the linked match teams with its persisted schedule", () => {
    expect(migrationSource).toContain(
      "COALESCE(matches_table.home_team_id, bracket_matches_table.home_team_id) AS home_team_id",
    );
    expect(migrationSource).toContain(
      "COALESCE(matches_table.away_team_id, bracket_matches_table.away_team_id) AS away_team_id",
    );
    expect(migrationSource).toContain(
      "COALESCE(matches_table.scheduled_slot, bracket_matches_table.planned_scheduled_slot) AS scheduled_slot",
    );
  });

  it("keeps the structural knockout position as its own slot", () => {
    expect(migrationSource).toContain("bracket_matches_table.slot_number");
    expect(migrationSource).toContain(
      "ORDER BY bracket_matches.round_number ASC, bracket_matches.slot_number ASC",
    );
  });
});
