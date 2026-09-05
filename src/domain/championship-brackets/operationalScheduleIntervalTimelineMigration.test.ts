import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260905190844_preserve_operational_interval_timeline_and_labels.sql",
  ),
  "utf8",
);

describe("operational schedule interval timeline migration", () => {
  it("preserves original timeline gaps and does not evaluate rest rules", () => {
    expect(migrationSource).toContain("matches_table.start_time + make_interval");
    expect(migrationSource).toContain("SELECT max(planned_end_at)");
    expect(migrationSource).toContain("COALESCE(cursor_at, item_record.original_start_at)");
    expect(migrationSource).toContain("IF false AND public.resolve_scheduled_match_rest_gap_conflict(");
  });
});
