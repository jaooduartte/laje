import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260830113000_include_opening_bonus_in_home_dashboard_metrics.sql",
  ),
  "utf8",
);

describe("home dashboard opening bonus migration", () => {
  it("inclui o bônus da abertura na pontuação exibida pelo dashboard", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_home_dashboard_metrics",
    );
    expect(migration).toContain(
      "FROM public.championship_overall_score_adjustments AS adjustments_table",
    );
    expect(migration).toContain("adjustment_type = 'OPENING_CEREMONY'");
    expect(migration).toContain("COALESCE(MAX(ob.total_opening_bonus), 0)");
  });

  it("contextualiza a maior diferença pela modalidade e não inclui o card de modalidades", () => {
    expect(migration).toContain("sports_table.name AS sport_name");
    expect(migration).toContain("'pontos de diferença'");
    expect(migration).toContain("'sets de diferença'");
    expect(migration).not.toContain("'id', 'MOST_MODALITIES'");
  });
});
