import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260913161000_add_interlaje_volleyball_qualification_display_metrics.sql",
  ),
  "utf8",
);

describe("group stage qualification display metrics migration", () => {
  it("uses the same qualification pool ranking that seeds the knockout bracket", () => {
    expect(migration).toContain(
      "get_championship_bracket_competition_qualification_pool_ranking",
    );
    expect(migration).toContain("qualification_pool_rank");
    expect(migration).toContain("qualification_ranking.qualification_rank");
  });

  it("normalizes every volleyball tie-break metric used by the standings display", () => {
    expect(migration).toContain("comparison_goals_for NUMERIC");
    expect(migration).toContain("comparison_sets_for NUMERIC");
    expect(migration).toContain("comparison_rally_points_for NUMERIC");
    expect(migration).toContain("comparison_factor");
  });

  it("keeps the raw metrics outside the Interlaje volleyball qualification pool", () => {
    expect(migration).toContain("normalized_metrics.goals_for::numeric");
    expect(migration).toContain("normalized_metrics.sets_for::numeric");
  });
});
