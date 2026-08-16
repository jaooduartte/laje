import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260813222830_record_exact_preview_relocation_pending_history.sql",
  ),
  "utf8",
);

describe("championship bracket preview relocation pending history migration", () => {
  it("records pending reductions while the job is reorganizing the schedule", () => {
    expect(migration).toContain("current_stage = 'COMPACTING_GROUPS'");
    expect(migration).toContain("current_stage LIKE 'Reorganizando grade:%'");
    expect(migration).toContain("'PENDING_MATCH_COUNT_DECREASED'");
    expect(migration).toContain("'pending_matches_before', pending_matches_after + 1");
    expect(migration).toContain("'pending_matches_after', pending_matches_after");
    expect(migration).toContain("clock_timestamp()");
  });

  it("continues to ignore games already assigned before the update", () => {
    expect(migration).toContain("IF NOT NEW.assigned OR OLD.assigned THEN");
  });
});
