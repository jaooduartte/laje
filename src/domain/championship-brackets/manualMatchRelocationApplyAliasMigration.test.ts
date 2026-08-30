import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260830210000_fix_manual_match_relocation_apply_selected_alias.sql",
  ),
  "utf8",
);

describe("manual match relocation application alias migration", () => {
  it("uses the change record selection flag instead of the schedule record", () => {
    expect(migration).toContain("changes_table.is_selected");
    expect(migration).toContain("changes_json.is_selected");
    expect(migration).toContain("apply_manual_match_relocation(uuid,jsonb,bigint)");
  });
});
