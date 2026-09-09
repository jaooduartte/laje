import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260908215016_add_group_stage_standings_for_qualification_filters.sql",
  ),
  "utf8",
);

describe("group stage standings migration", () => {
  it("exposes a dedicated group-stage source without accumulated standings", () => {
    expect(migration).toContain("get_championship_group_stage_standings");
    expect(migration).toContain("bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase");
    expect(migration).toContain("COALESCE(matches_table.is_double_walkover, false) = false");
    expect(migration).not.toContain("public.standings");
  });

  it("keeps raw points visible and normalizes cross-group ordering internally", () => {
    expect(migration).toContain("ranked_comparisons.points");
    expect(migration).toContain("maximum_group_matches");
    expect(migration).toContain("comparison_rank");
  });

  it("uses the saved group draw order after group-stage criteria", () => {
    expect(migration).toContain("championship_bracket_tie_break_resolutions");
    expect(migration).toContain("group_draw_orders.draw_order");
  });
});
