import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907194546_recalculate_schedule_after_operational_interval_removal.sql",
  ),
  "utf8",
);

describe("operational schedule interval removal migration", () => {
  it("recalculates the released court from the removed interval start", () => {
    expect(migrationSource).toContain(
      "public.build_operational_schedule_interval_preview(uuid,jsonb)",
    );
    expect(migrationSource).toContain("WHEN interval_action = ''REMOVE'' THEN GREATEST(");
    expect(migrationSource).toContain(
      "public.combine_bracket_schedule_timestamp(day_record.event_date, anchor_time_value)",
    );
    expect(migrationSource).toContain("ELSE GREATEST(");
    expect(migrationSource).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
