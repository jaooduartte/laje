import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260813190000_add_championship_bracket_preview_job_history.sql",
  ),
  "utf8",
);

describe("championship bracket preview job history migration", () => {
  it("derives the job stage transitions and terminal status without locking the active job table", () => {
    expect(migration).toContain("job_events");
    expect(migration).toContain("STAGE_CHANGED");
    expect(migration).toContain("COMPACTING_GROUPS");
    expect(migration).toContain("job_record.completed_at");
    expect(migration).not.toContain(
      "championship_bracket_preview_job_stage_event_trigger",
    );
  });

  it("records when group and knockout matches leave the pending state", () => {
    expect(migration).toContain("GROUP_MATCH_SCHEDULED");
    expect(migration).toContain("KNOCKOUT_MATCH_SCHEDULED");
    expect(migration).toContain("IF NOT NEW.assigned OR OLD.assigned THEN");
    expect(migration).toContain("OR OLD.scheduled_date IS NOT NULL");
  });

  it("returns the chronological history with the job status", () => {
    expect(migration).toContain("'events', COALESCE(");
    expect(migration).toContain("jsonb_agg(event ORDER BY occurred_at, event_order)");
  });
});
