import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260813210100_record_exact_preview_compaction_history.sql",
  ),
  "utf8",
);

describe("championship bracket preview compaction history migration", () => {
  it("records the exact transition to compaction", () => {
    expect(migration).toContain("'STAGE_CHANGED'");
    expect(migration).toContain("'COMPACTING_GROUPS'");
    expect(migration).toContain("clock_timestamp()");
    expect(migration).not.toContain("max(assignments_table.assigned_at)");
  });

  it("records only reductions of pending matches during compaction", () => {
    expect(migration).toContain("'PENDING_MATCH_COUNT_DECREASED'");
    expect(migration).toContain("pending_matches_after + 1");
    expect(migration).toContain("pending_matches_after");
    expect(migration).toContain("current_stage = 'COMPACTING_GROUPS'");
  });
});
