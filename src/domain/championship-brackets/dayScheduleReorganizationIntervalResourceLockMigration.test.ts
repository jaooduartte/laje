import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903042751_allow_day_reorganization_to_remove_interval_resource_lock.sql",
  ),
  "utf8",
);

describe("day schedule reorganization interval resource lock migration", () => {
  it("releases only the selected generic hard reservation while previewing a removed interval", () => {
    expect(migration).toContain("removable_resource_lock");
    expect(migration).toContain("break_policy = ''REMOVE''");
    expect(migration).toContain("COALESCE(resource_lock.value->>''lock_mode'', '''') = ''HARD''");
    expect(migration).toContain("NULLIF(resource_lock.value->>''sport_id'', '''') IS NULL");
    expect(migration).toContain("NULLIF(resource_lock.value->>''naipe'', '''') IS NULL");
  });

  it("removes the selected reservation from the configuration only on confirmation", () => {
    expect(migration).toContain("payload_snapshot = jsonb_set(");
    expect(migration).toContain("'{resource_locks}'");
    expect(migration).toContain("apply_day_schedule_reorganization");
  });
});
