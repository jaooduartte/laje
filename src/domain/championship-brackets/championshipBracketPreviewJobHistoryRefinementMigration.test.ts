import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260813210000_refine_championship_bracket_preview_job_history.sql",
  ),
  "utf8",
);

describe("championship bracket preview job history refinement migration", () => {
  it("marks each scheduled match with the stage that produced it", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS stage TEXT");
    expect(migration).toContain("current_stage");
    expect(migration).toContain("stage,\n    details");
  });

  it("returns the recorded stage for each scheduled-match event", () => {
    expect(migration).toContain("'stage', events_table.stage");
  });
});
