import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260906215701_equalize_interlaje_volleyball_uneven_groups.sql",
  ),
  "utf8",
);

function resolveVolleyballPoints(setsFor: number, setsAgainst: number) {
  if (setsFor === 2 && setsAgainst === 0) return 3;
  if (setsFor === 2 && setsAgainst === 1) return 2;
  if (setsFor === 1 && setsAgainst === 2) return 1;
  return 0;
}

function resolveProportionalPoints(points: number, groupSize: number) {
  return points / ((groupSize - 1) * 3);
}

describe("Interlaje volleyball uneven groups migration", () => {
  it("uses 3-2-1-0 when calculating group positions", () => {
    expect(migration).toContain("matches_table.home_score = 2 AND matches_table.away_score = 0 THEN 3");
    expect(migration).toContain("matches_table.home_score = 2 AND matches_table.away_score = 1 THEN 2");
    expect(migration).toContain("matches_table.home_score = 1 AND matches_table.away_score = 2 THEN 1");
    expect(migration).toContain("matches_table.home_score = 0 AND matches_table.away_score = 2 THEN 3");
  });

  it("normalizes volleyball candidates by the programmed group size and set metrics", () => {
    expect(migration).toContain("candidate_rows.points_base::numeric");
    expect(migration).toContain("(candidate_rows.group_size - 1)::numeric * candidate_rows.maximum_points_per_match");
    expect(migration).toContain("AS sets_for_per_match");
    expect(migration).toContain("AS rally_points_for_per_match");
    expect(migration).toContain("AS red_cards_per_match");
    expect(migration).toContain("scored_candidate_rows.sets_average");
  });

  it("keeps a 3-team campaign with 2-0 and 1-2 ahead of the worse 4-team campaign", () => {
    const threeTeamGroupPoints =
      resolveVolleyballPoints(2, 0) + resolveVolleyballPoints(1, 2);
    const fourTeamGroupPoints =
      resolveVolleyballPoints(2, 1) +
      resolveVolleyballPoints(2, 1) +
      resolveVolleyballPoints(0, 2);

    expect(threeTeamGroupPoints).toBe(4);
    expect(fourTeamGroupPoints).toBe(4);
    expect(resolveProportionalPoints(threeTeamGroupPoints, 3)).toBeCloseTo(2 / 3);
    expect(resolveProportionalPoints(fourTeamGroupPoints, 4)).toBeCloseTo(4 / 9);
    expect(resolveProportionalPoints(threeTeamGroupPoints, 3)).toBeGreaterThan(
      resolveProportionalPoints(fourTeamGroupPoints, 4),
    );
  });

  it("keeps head-to-head inside the same volleyball group and preserves raw output points", () => {
    expect(migration).toContain("counterpart.group_id IS NOT DISTINCT FROM h2h_scope.group_id");
    expect(migration).toContain("ordered.goal_diff, ordered.points");
    expect(migration).toContain("COALESCE(matches_table.is_double_walkover, false) = false");
  });
});
