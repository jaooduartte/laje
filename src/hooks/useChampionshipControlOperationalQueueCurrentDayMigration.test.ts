import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260830212000_limit_operational_control_queue_to_current_day.sql",
  ),
  "utf8",
);

describe("operational control queue current day migration", () => {
  it("limits compact operational items to the current Sao Paulo date", () => {
    expect(migration).toContain("timezone('America/Sao_Paulo', now())::DATE");
    expect(migration).toContain("matches_table.scheduled_date = timezone('America/Sao_Paulo', now())::DATE");
    expect(migration).toContain("sessions_table.scheduled_date = timezone('America/Sao_Paulo', now())::DATE");
  });
});
