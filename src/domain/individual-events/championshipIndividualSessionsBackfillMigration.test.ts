import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260815011057_backfill_individual_sessions_from_setup.sql",
  ),
  "utf8",
);

describe("championship individual sessions backfill migration", () => {
  it("sincroniza os dados das configurações já salvas", () => {
    expect(migration).toContain("individual_session_configs");
    expect(migration).toContain(
      "sync_championship_individual_events_from_setup",
    );
    expect(migration).toContain(
      "sync_championship_individual_sessions_from_setup",
    );
  });
});
