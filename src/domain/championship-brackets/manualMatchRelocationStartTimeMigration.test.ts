import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260830184420_add_manual_match_relocation_start_time.sql",
  ),
  "utf8",
);

describe("manual match relocation start time migration", () => {
  it("replaces the unsupported UUID aggregate in the preview", () => {
    expect(migration).toContain("(array_agg(championship_id))[1]");
    expect(migration).toContain(
      "'SELECT count(*), min(championship_id), min(season_year)'",
    );
  });

  it("accepts only an earlier optional start time and reflows the target court", () => {
    expect(migration).toContain("target_start_time :=");
    expect(migration).toContain("target_start_time >= target_day_record.start_time");
    expect(migration).toContain("target_start_time IS NOT NULL");
    expect(migration).toContain("next_day_start");
  });

  it("persists only an earlier day start while keeping day-end extension", () => {
    expect(migration).toContain("start_time = LEAST(start_time, calculated_day_start)");
    expect(migration).toContain("end_time = GREATEST(end_time, calculated_day_end)");
  });
});
