import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260823120400_limit_interlaje_overall_standings_to_registered_teams.sql",
  ),
  "utf8",
);

describe("interlaje overall standings migration", () => {
  it("includes registered active teams without points and ignores zero-point ties", () => {
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
    expect(migration).not.toContain(
      "AND (placement_totals.team_id IS NOT NULL OR opening_totals.team_id IS NOT NULL)",
    );
    expect(migration).toContain("WHERE overall_points > 0");
  });
});
