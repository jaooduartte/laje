import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260908231638_fix_group_stage_placement_comparison_points.sql",
  ),
  "utf8",
);

describe("group stage placement comparison points migration", () => {
  it("exposes proportional points separately from the raw group-stage points", () => {
    expect(migration).toContain("comparison_points numeric");
    expect(migration).toContain("comparison_rows.points::numeric");
    expect(migration).toContain("AS comparison_points");
    expect(migration).toContain("DROP FUNCTION public.get_championship_group_stage_standings");
  });

  it("uses proportional points first and raw goal difference as the next cross-group criterion", () => {
    expect(migration).toContain("compared_points.comparison_points DESC");
    expect(migration).toContain("compared_points.goal_diff DESC");
    expect(migration).toContain("WHEN compared_points.uses_proportional_points THEN NULL::bigint");
    expect(migration).toContain("replacement_comparison_fragment");
  });
});
