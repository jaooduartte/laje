import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260901173000_include_knockout_placeholders_in_manual_relocation.sql",
  ),
  "utf8",
);
const placeholderFixMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903032856_preserve_manual_schedule_and_fix_placeholder_preview.sql",
  ),
  "utf8",
);

describe("manual relocation planned placeholder migration", () => {
  it("extends both preview builders with unresolved knockout placeholders", () => {
    expect(migration).toContain("append_manual_relocation_placeholders");
    expect(migration).toContain("build_manual_match_relocation_preview");
    expect(migration).toContain("build_manual_match_relocation_slot_preview");
    expect(migration).toContain("bracket_matches_table.match_id IS NULL");
    expect(migration).toContain("bracket_matches_table.is_bye = false");
    expect(migration).toContain("'displaced_placeholders_count'");
    expect(migration).toContain("'{slots}', slots");
  });

  it("returns and persists discriminator fields without materializing matches", () => {
    expect(migration).toContain("'item_type', 'KNOCKOUT_PLACEHOLDER'");
    expect(migration).toContain("'placeholder_id', placeholder_record.id");
    expect(migration).toContain("planned_scheduled_date = changes_table.scheduled_date");
    expect(migration).toContain("planned_start_time = (changes_table.start_time");
    expect(migration).toContain("AND bracket_matches_table.match_id IS NULL");
  });

  it("keeps the existing preview revision and confirmation protection", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("A prévia está desatualizada");
    expect(migration).toContain("reprogramming_revision = reprogramming_revision + 1");
  });

  it("loads the championship data through the bracket edition for slot previews", () => {
    expect(placeholderFixMigration).toContain(
      "JOIN public.championship_bracket_editions AS editions_table",
    );
    expect(placeholderFixMigration).toContain(
      "editions_table.championship_id",
    );
    expect(placeholderFixMigration).toContain(
      "competitions_table.championship_id",
    );
  });
});
