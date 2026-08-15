import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260814221908_correct_exact_preview_knockout_match_number_sequence.sql",
  ),
  "utf8",
);

describe("championship bracket preview knockout match number sequence migration", () => {
  it("continues the number shown by group-stage assignments", () => {
    expect(migration).toContain(
      "assignments_table.match_number AS fixed_match_number",
    );
    expect(migration).not.toContain(
      "matches_table.slot_number AS fixed_match_number",
    );
  });

  it("overrides the predecessor and knockout card numbers", () => {
    expect(migration).toContain(
      "resolve_preview_display_match_numbers",
    );
    expect(migration).toContain("'match_number'");
    expect(migration).toContain("'home_source_match_number'");
    expect(migration).toContain("'away_source_match_number'");
  });
});
