import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260912220253_add_group_stage_volleyball_metrics.sql",
  ),
  "utf8",
);

describe("group stage volleyball metrics migration", () => {
  it("exposes group-stage set and rally metrics without including knockout matches", () => {
    expect(migration).toContain(
      "get_championship_group_stage_standings_display_metrics",
    );
    expect(migration).toContain("sets_for BIGINT");
    expect(migration).toContain("rally_points_for BIGINT");
    expect(migration).toContain("'GROUP_STAGE'::public.bracket_phase");
  });

  it("preserves raw group points and the proportional comparison metric", () => {
    expect(migration).toContain("group_stage_standings.points");
    expect(migration).toContain("group_stage_standings.comparison_points");
  });
});
