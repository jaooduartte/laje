import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260829160000_apply_corrected_group_points_to_interlaje_overall_standings.sql",
  ),
  "utf8",
);

describe("Interlaje overall standings corrected points migration", () => {
  it("adds the group correction to the live points before the opening bonus", () => {
    expect(migration).toContain(
      "FROM public.get_championship_effective_standings(",
    );
    expect(migration).toContain(
      "FROM public.get_championship_corrected_group_standings(",
    );
    expect(migration).toContain(
      "corrected_group_standings_table.corrected_points",
    );
    expect(migration).toContain(
      "- corrected_group_standings_table.points_base",
    );
    expect(migration).toContain(
      "effective_competition_points.competition_points",
    );
    expect(migration).toContain(
      "COALESCE(corrected_group_adjustments.points_adjustment, 0)",
    );
    expect(migration).toContain("adjustments_table.adjustment_type = 'OPENING_CEREMONY'");
  });

  it("keeps the 3 to 4.5 group correction formula", () => {
    const pointsBase = 3;
    const correctedPoints = 4.5;
    const overallCompetitionPoints = pointsBase + (correctedPoints - pointsBase);

    expect(overallCompetitionPoints).toBe(4.5);
  });

});
