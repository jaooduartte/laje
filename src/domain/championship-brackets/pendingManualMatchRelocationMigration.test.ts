import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260830193000_add_pending_manual_match_relocations.sql",
);

describe("pending manual match relocation migration", () => {
  it("keeps held matches out of active scheduling and restores them through relocation", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("is_pending_manual_relocation BOOLEAN NOT NULL DEFAULT false");
    expect(migration).toContain("hold_matches_for_manual_relocation");
    expect(migration).toContain("pending_manual_relocation_previous_label");
    expect(migration).toContain("scheduled_date = NULL");
    expect(migration).toContain("location = NULL");
    expect(migration).toContain("is_pending_manual_relocation = CASE WHEN changes_table.is_selected THEN false");
    expect(migration).toContain("COALESCE(matches_table.is_pending_manual_relocation, false) = false");
  });
});
