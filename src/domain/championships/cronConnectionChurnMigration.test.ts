import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907035000_reduce_pg_cron_connection_churn.sql",
  ),
  "utf8",
);

describe("reduce pg_cron connection churn migration", () => {
  it("agenda o watchdog a cada dois minutos com sintaxe cron", () => {
    expect(migration).toContain("'*/2 * * * *'");
    expect(migration).not.toContain("'2 minutes'");
  });
});
