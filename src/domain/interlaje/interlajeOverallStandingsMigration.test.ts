import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260829133000_use_live_points_in_interlaje_overall_standings.sql",
  ),
  "utf8",
);

describe("interlaje overall standings migration", () => {
  it("sums live competition points with the opening bonus for registered active teams", () => {
    expect(migration).toContain(
      "FROM public.championship_bracket_team_registrations AS registrations_table",
    );
    expect(migration).toContain(
      "editions_table.championship_id = _championship_id",
    );
    expect(migration).toContain("editions_table.season_year = _season_year");
    expect(migration).toContain(
      "WHERE teams_table.is_active IS DISTINCT FROM false",
    );
    expect(migration).toContain(
      "FROM public.get_championship_effective_standings(",
    );
    expect(migration).toContain(
      "COALESCE(live_competition_points.competition_points, 0)",
    );
    expect(migration).toContain("adjustments_table.adjustment_type = 'OPENING_CEREMONY'");
    expect(migration).not.toContain("automatic_placements AS");
    expect(migration).not.toContain("official_placements AS");
    expect(migration).toContain("WHERE totals_table.overall_points > 0");
  });
});
