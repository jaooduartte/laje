import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260906173842_exclude_double_walkovers_from_group_rankings.sql",
  ),
  "utf8",
);

describe("double walkover group rankings migration", () => {
  it("excludes double walkovers from group score and direct confrontation calculations", () => {
    expect(migration).toContain(
      "get_championship_bracket_competition_group_rankings",
    );
    expect(migration).toContain(
      "COALESCE(matches_table.is_double_walkover, false) = false",
    );
    expect(migration).toContain("<> 3 THEN");
  });
});
