import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260814183929_record_structural_reorganization_history.sql",
  ),
  "utf8",
);

describe("championship bracket preview structural reorganization history migration", () => {
  it("records the transition to structural slot reorganization", () => {
    expect(migration).toContain("'Reorganizando slots estruturais:%'");
    expect(migration).toContain("'STAGE_CHANGED'");
    expect(migration).toContain("THEN NEW.stage");
    expect(migration).toContain(
      "championship_bracket_preview_reorganization_stage_event_trigger",
    );
  });

  it("records every pending-match reduction during structural reorganization", () => {
    expect(migration).toContain("'PENDING_MATCH_COUNT_DECREASED'");
    expect(migration).toContain("pending_matches_after + 1");
    expect(migration).toContain("'pending_matches_after', pending_matches_after");
    expect(migration).toContain(
      "current_stage LIKE 'Reorganizando slots estruturais:%'",
    );
  });
});
