import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907180000_fix_manual_relocation_placeholder_edition_join.sql",
  ),
  "utf8",
);

describe("manual match relocation placeholder edition join migration", () => {
  it("repairs the placeholder function called by the regular relocation preview", () => {
    expect(migration).toContain(
      "public.append_manual_relocation_placeholders(uuid,jsonb)",
    );
    expect(migration).toContain("EXECUTE patched_definition");
  });

  it("joins the bracket edition before using its championship scope", () => {
    expect(migration).toContain(
      "JOIN public.championship_bracket_editions AS editions_table",
    );
    expect(migration).toContain(
      "ON editions_table.id = competitions_table.bracket_edition_id",
    );
    expect(migration).toContain(
      "championship_sports_table.championship_id = editions_table.championship_id",
    );
  });
});
