import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903173759_add_interlaje_position_points_standings.sql",
  ),
  "utf8",
);

describe("Interlaje position point settings migration", () => {
  it("creates the 20-position seasonal setting with the regulation defaults", () => {
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.championship_overall_position_point_settings",
    );
    expect(migration).toContain("final_position INTEGER NOT NULL CHECK (final_position BETWEEN 1 AND 20)");
    expect(migration).toContain("points INTEGER NOT NULL CHECK (points >= 0)");
    expect(migration).toContain(
      "(1, 24), (2, 22), (3, 20), (4, 18), (5, 16)",
    );
    expect(migration).toContain(
      "(16, 5), (17, 4), (18, 3), (19, 2), (20, 1)",
    );
  });

  it("uses the placement settings for the overall standings and preserves bonuses and W.O. deductions", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_interlaje_competition_standings",
    );
    expect(migration).toContain("ROW_NUMBER() OVER");
    expect(migration).toContain("COALESCE(settings_table.points, 0) AS placement_points");
    expect(migration).toContain("SUM(competition_points.placement_points)");
    expect(migration).toContain("+ COALESCE(opening_totals.opening_bonus_points, 0)");
    expect(migration).toContain("- COALESCE(walkover_totals.walkover_penalty_points, 0)");
  });

  it("copies the configured table when the next Interlaje season opens", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.advance_championship_season",
    );
    expect(migration).toContain("championship_record.code = 'INTERLAJE'::public.championship_code");
    expect(migration).toContain("next_season_year_value");
  });
});
