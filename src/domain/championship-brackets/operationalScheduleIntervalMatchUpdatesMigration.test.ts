import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260905192551_allow_operational_schedule_interval_match_updates.sql",
  ),
  "utf8",
);

describe("operational schedule interval match updates migration", () => {
  it("permits live and finished match schedule updates only inside the controlled interval RPC", () => {
    expect(migrationSource).toContain("allow_operational_schedule_interval_match_update");
    expect(migrationSource).toContain("public.validate_mesa_match_update()");
    expect(migrationSource).toContain("public.apply_operational_schedule_interval(uuid,jsonb,bigint)");
    expect(migrationSource).toContain("set_config('app.allow_operational_schedule_interval_match_update', 'true', true)");
    expect(migrationSource).toContain("set_config('app.allow_operational_schedule_interval_match_update', 'false', true)");
  });
});
