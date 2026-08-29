import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260829174500_limit_operational_control_queue_to_one_scheduled_match_per_court.sql",
  ),
  "utf8",
);

describe("operational control queue limit migration", () => {
  it("keeps all live matches and exposes one scheduled match per court", () => {
    expect(migration).toContain("matches_table.status = 'LIVE'");
    expect(migration).toContain("scheduled_matches.queue_position <= 1");
    expect(migration).not.toContain("scheduled_matches.queue_position <= 2");
  });
});
