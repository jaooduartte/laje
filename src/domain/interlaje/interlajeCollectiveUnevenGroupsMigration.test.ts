import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907155709_equalize_interlaje_collective_uneven_groups.sql",
  ),
  "utf8",
);

describe("Interlaje collective uneven groups migration", () => {
  it("applies the corrected group points before ranking every collective sport", () => {
    expect(migration).toContain(
      "public.get_championship_corrected_group_standings(",
    );
    expect(migration).toContain(
      "corrected_standings_table.corrected_points\n          - corrected_standings_table.points_base",
    );
    expect(migration).toContain("prepared.points AS comparison_points");
  });

  it("keeps the group standings source distinct from the corrected overall ranking", () => {
    expect(migration).toContain(
      "FROM public.get_championship_effective_standings(",
    );
    expect(migration).toContain("ordered.goal_diff, ordered.points");
  });
});
