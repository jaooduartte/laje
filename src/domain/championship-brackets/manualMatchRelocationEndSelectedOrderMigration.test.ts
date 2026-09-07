import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907184500_fix_manual_relocation_end_selected_order.sql",
  ),
  "utf8",
);

describe("manual match relocation end selected order migration", () => {
  it("places the selected games after the displaced queue when moving to the end", () => {
    expect(migration).toContain(
      "WHEN insertion_position = 'END' AND target_start_time IS NULL THEN 100000 + row_number() OVER (",
    );
    expect(migration).toContain("EXECUTE patched_definition");
  });
});
