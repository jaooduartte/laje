import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903181919_exclude_unplayed_and_disqualified_interlaje_position_points.sql",
  ),
  "utf8",
);

describe("Interlaje position point exclusions migration", () => {
  it("does not grant placement points before a competition has a completed result", () => {
    expect(migration).toContain(
      "BOOL_OR(effective_standings.played > 0) OVER",
    );
    expect(migration).toContain("AS has_completed_result");
    expect(migration).toContain(
      "NOT ranked_standings.has_completed_result THEN 0",
    );
  });

  it("keeps disqualified teams out of the placement points", () => {
    expect(migration).toContain(
      "public.is_championship_competition_team_disqualified",
    );
    expect(migration).toContain("prepared_standings.is_disqualified ASC");
    expect(migration).toContain("WHEN ranked_standings.is_disqualified");
  });
});
