import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260814213543_expose_exact_preview_knockout_predecessor_match_numbers.sql",
  ),
  "utf8",
);

describe("championship bracket preview knockout predecessor match numbers migration", () => {
  it("exposes the displayed number of each knockout predecessor", () => {
    expect(migration).toContain("'home_source_match_number'");
    expect(migration).toContain("'away_source_match_number'");
    expect(migration).toContain("display_match_numbers");
    expect(migration).toContain("numbered_matches");
  });

  it("preserves the preview function access policy", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.get_championship_bracket_preview_job_day(UUID, DATE)",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_championship_bracket_preview_job_day(UUID, DATE)",
    );
  });
});
