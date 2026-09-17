import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260917024500_fix_knockout_descendant_target_reference.sql",
  ),
  "utf8",
);

describe("knockout descendant target reference fix migration", () => {
  it("removes the invalid UPDATE ... FROM join reference to the target alias", () => {
    expect(migration).toContain(
      "FROM public.championship_bracket_matches AS source_home\n        WHERE source_home.id = target.source_home_bracket_match_id",
    );
    expect(migration).toContain(
      "FROM public.championship_bracket_matches AS source_away\n        WHERE source_away.id = target.source_away_bracket_match_id",
    );
    expect(migration).toContain("match_id = NULL");
  });

  it("keeps the invalid fragment only as the migration replacement target", () => {
    expect(migration).toContain("invalid_update_fragment TEXT");
    expect(migration).toContain("corrected_update_fragment TEXT");
    expect(migration).toContain(
      "function_definition := replace(\n    function_definition,\n    invalid_update_fragment,\n    corrected_update_fragment",
    );
  });

  it("does not hardcode any championship, competition or team id", () => {
    expect(migration).not.toContain("c7718ca6-4447-4c20-a8ca-5781a34a3778");
    expect(migration).not.toContain("81e8122d-ef06-4a32-808c-c83dabf417d3");
    expect(migration).not.toContain("a07bf4ba-bf46-4408-9b6a-1d65274af86c");
  });
});
