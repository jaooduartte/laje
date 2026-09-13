import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260912124544_prioritize_operational_queue_planned_time.sql",
  ),
  "utf8",
);

describe("operational control queue planned time migration", () => {
  it("uses the planned time to break a tie in the court slot", () => {
    expect(migration).toContain(
      "COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST,\n          COALESCE(matches_table.start_time, matches_table.scheduled_start_time) ASC NULLS LAST,\n          COALESCE(matches_table.queue_position, matches_table.scheduled_slot) ASC NULLS LAST",
    );
  });

  it("adds the planned-time field without rewriting historical schedules", () => {
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS scheduled_start_time TIMESTAMPTZ NULL",
    );
    expect(migration).not.toContain("UPDATE public.matches AS matches_table");
  });
});
