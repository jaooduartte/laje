import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907191938_add_knockout_penalty_shootouts.sql",
  ),
  "utf8",
);

describe("knockout penalty shootouts migration", () => {
  it("limits penalty shootouts to the supported sport codes", () => {
    expect(migration).toContain(
      "sports_table.code IN (''FUTEBOL_SOCIETY'', ''BEACH_SOCCER'', ''FUTSAL'')",
    );
  });

  it("requires a different penalty score and resolves the official winner", () => {
    expect(migration).toContain("NEW.home_penalty_score != NEW.away_penalty_score");
    expect(migration).toContain("penalty_shootout_tie_breaker_rule");
    expect(migration).toContain("NEW.resolved_tie_breaker_rule := COALESCE(penalty_shootout_tie_breaker_rule");
  });

  it("uses the penalty winner for standings and knockout progression", () => {
    expect(migration).toContain("public.validate_championship_knockout_match_finish()");
    expect(migration).toContain("sports_table.code AS sport_code");
    expect(migration).toContain("WHEN sport_code IN (''FUTEBOL_SOCIETY'', ''BEACH_SOCCER'', ''FUTSAL'')");
  });
});
