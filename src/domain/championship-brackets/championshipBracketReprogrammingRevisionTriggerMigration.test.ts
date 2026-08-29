import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260829120000_fix_match_reprogramming_revision_trigger.sql",
  ),
  "utf8",
);

describe("match reprogramming revision trigger migration", () => {
  it("resolves a match edition without accessing bracket fields absent from matches", () => {
    expect(migration).toContain("trigger_record := CASE TG_OP");
    expect(migration).toContain("WHEN 'matches' THEN");
    expect(migration).toContain(
      "editions_table.championship_id = (trigger_record->>'championship_id')::uuid",
    );
    expect(migration).toContain(
      "editions_table.season_year = (trigger_record->>'season_year')::integer",
    );
    expect(migration).not.toContain("NEW.bracket_edition_id");
    expect(migration).not.toContain("OLD.bracket_edition_id");
  });

  it("does not bump the revision when a match scheduling value was not changed", () => {
    expect(migration).toContain("TG_TABLE_NAME = 'matches'");
    expect(migration).toContain("trigger_record = previous_record");
  });
});
