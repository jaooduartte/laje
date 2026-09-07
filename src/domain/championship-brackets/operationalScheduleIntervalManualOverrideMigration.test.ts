import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907180100_allow_operational_interval_manual_override_updates.sql",
  ),
  "utf8",
);

describe("operational schedule interval manual override migration", () => {
  it("permits a protected manual relocation only while applying an interval", () => {
    expect(migrationSource).toContain(
      "public.apply_operational_schedule_interval(uuid,jsonb,bigint)",
    );
    expect(migrationSource).toContain(
      "app.allow_manual_schedule_override_update'', ''true'', true",
    );
    expect(migrationSource).toContain(
      "app.allow_manual_schedule_override_update'', ''false'', true",
    );
    expect(migrationSource).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
