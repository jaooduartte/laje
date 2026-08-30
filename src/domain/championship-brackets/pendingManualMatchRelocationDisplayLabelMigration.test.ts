import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260830195000_preserve_displayed_pending_match_labels.sql",
);

describe("pending manual match relocation display label migration", () => {
  it("uses the current visual match label provided by the administrative list", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("_payload->''previous_labels''->>matches_table.id::TEXT");
    expect(migration).toContain("pending_manual_relocation_previous_label = COALESCE(");
  });
});
