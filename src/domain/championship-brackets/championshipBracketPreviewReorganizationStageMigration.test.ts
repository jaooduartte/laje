import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260813220029_record_exact_preview_reorganization_stage_event.sql",
  ),
  "utf8",
);

describe("championship bracket preview reorganization stage migration", () => {
  it("records the first entry into reorganization with the database timestamp", () => {
    expect(migration).toContain("AFTER UPDATE OF stage");
    expect(migration).toContain("NEW.stage LIKE 'Reorganizando grade:%'");
    expect(migration).toContain("COALESCE(OLD.stage, '') NOT LIKE 'Reorganizando grade:%'");
    expect(migration).toContain("'STAGE_CHANGED'");
    expect(migration).toContain("'COMPACTING_GROUPS'");
    expect(migration).toContain("clock_timestamp()");
  });

  it("does not replace existing triggers or duplicate the history event", () => {
    expect(migration).not.toContain("DROP TRIGGER");
    expect(migration).toContain(
      "ON CONFLICT (job_id, event_type, group_match_id, knockout_match_id)",
    );
  });
});
