import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260905185759_fix_operational_schedule_interval_session_time_comparison.sql",
  ),
  "utf8",
);

describe("operational schedule interval session time comparison migration", () => {
  it("redefines the persisted preview function with matching time values", () => {
    expect(migrationSource).toContain("pg_get_functiondef");
    expect(migrationSource).toContain("public.build_operational_schedule_interval_preview(uuid,jsonb)");
    expect(migrationSource).toContain("planned_end_at AT TIME ZONE ''America/Sao_Paulo'')::TIME");
    expect(migrationSource).toContain("planned_start_at AT TIME ZONE ''America/Sao_Paulo'')::TIME");
  });
});
