import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260912150302_order_operational_queue_by_planned_time.sql",
  ),
  "utf8",
);

describe("operational control queue planned time order migration", () => {
  it("prioritizes the planned time before the global slot", () => {
    expect(migration).toContain(
      "COALESCE(matches_table.scheduled_start_time, matches_table.start_time) ASC NULLS LAST,\n          COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST",
    );
  });

  it("does not rewrite live or finished matches while changing the queue order", () => {
    expect(migration).not.toContain("UPDATE public.matches AS matches_table");
  });
});
