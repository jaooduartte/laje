import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907154059_fix_v8_knockout_bye_hydration.sql",
  ),
  "utf8",
);

const baseMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260813040313_implement_full_exact_preview_v8.sql",
  ),
  "utf8",
);

describe("v8 knockout BYE hydration migration", () => {
  it("removes only the persisted BYE mismatch rejection", () => {
    expect(migration).toContain(
      "first_round_match_record.is_bye IS DISTINCT FROM expected_is_bye",
    );
    expect(migration).toContain("EXECUTE replace(function_definition, invalid_bye_validation, '');");
    expect(baseMigration).toContain("home_team_id = home_team_id");
    expect(baseMigration).toContain("is_bye = first_round_match_record.is_bye");
  });
});
