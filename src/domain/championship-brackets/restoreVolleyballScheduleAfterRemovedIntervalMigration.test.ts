import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907200251_restore_volleyball_schedule_after_removed_interval.sql",
  ),
  "utf8",
);

describe("restore volleyball schedule after removed interval migration", () => {
  it("restores only the affected volleyball sequence", () => {
    expect(migrationSource).toContain("INTERVAL '40 minutes'");
    expect(migrationSource).toContain("DATE '2026-09-07'");
    expect(migrationSource).toContain("'0e5c878e-cdbc-40ca-816a-84120f406261'::UUID");
    expect(migrationSource).toContain("matches_table.location = 'Campus Park'");
    expect(migrationSource).toContain("matches_table.court_name = 'Quadra'");
    expect(migrationSource).toContain("updated_match_count <> 5");
    expect(migrationSource).toContain("app.allow_manual_schedule_override_update");
  });
});
