import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260906211752_unify_interlaje_regulation_standings.sql",
  ),
  "utf8",
);

describe("Interlaje canonical standings migration", () => {
  it("uses the regulation ranking as the base for collective knockout projections", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_interlaje_regulation_competition_standings");
    expect(migration).toContain("public.get_interlaje_collective_ranking(");
    expect(migration).toContain("public.get_interlaje_knockout_projected_placements(");
    expect(migration).toContain("ranking.classification_rank");
    expect(migration).toContain("ranking_payload.has_pending_tie_break = false");
  });

  it("preserves zero-point exclusions and keeps the overall total on the canonical RPC", () => {
    expect(migration).toContain("ranking.is_disqualified OR NOT ranking.has_completed_result THEN 0");
    expect(migration).toContain("public.get_interlaje_regulation_competition_standings(");
    expect(migration).not.toContain("CROSS JOIN LATERAL public.get_interlaje_competition_standings(\n      _championship_id,\n      _season_year,\n      competition_contexts.sport_id");
    expect(migration).toContain("+ COALESCE(opening_totals.opening_bonus_points, 0)");
    expect(migration).toContain("- COALESCE(walkover_totals.walkover_penalty_points, 0)");
  });
});
