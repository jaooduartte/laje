import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907173000_fix_manual_match_relocation_preview_edition_scope.sql",
  ),
  "utf8",
);

describe("manual match relocation preview edition scope migration", () => {
  it("repairs the base function used by the preview RPC", () => {
    expect(migration).toContain(
      "public.build_manual_match_relocation_preview_base(uuid,jsonb)",
    );
    expect(migration).toContain("EXECUTE patched_definition");
  });

  it("uses the already loaded bracket edition instead of an absent table alias", () => {
    expect(migration).toContain("'editions_table.championship_id'");
    expect(migration).toContain("'bracket_edition_record.championship_id'");
    expect(migration).toContain("'editions_table.season_year'");
    expect(migration).toContain("'bracket_edition_record.season_year'");
    expect(migration).toContain("position('editions_table.' IN patched_definition) > 0");
  });
});
