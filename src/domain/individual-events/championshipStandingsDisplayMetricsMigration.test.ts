import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260912160028_add_standings_display_metrics.sql",
  ),
  "utf8",
);

describe("championship standings display metrics migration", () => {
  it("expõe métricas de sets e rally sem alterar a classificação efetiva", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_championship_standings_display_metrics",
    );
    expect(migration).toContain("FROM public.get_championship_effective_standings(");
    expect(migration).toContain("JOIN public.match_sets AS match_sets_table");
    expect(migration).toContain("COALESCE(matches_table.is_double_walkover, false) = false");
    expect(migration).toContain("rally_points_for INTEGER");
    expect(migration).toContain("rally_points_against INTEGER");
  });
});
