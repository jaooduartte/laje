import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907171500_allow_operational_schedule_intervals_without_representation_blockers.sql",
  ),
  "utf8",
);

describe("operational schedule interval representation migration", () => {
  it("does not block a manually added interval because of the preserved court sequence", () => {
    expect(migrationSource).toContain(
      "public.build_operational_schedule_interval_preview(uuid,jsonb)",
    );
    expect(migrationSource).toContain("IF false AND EXISTS");
    expect(migrationSource).toContain("WITH ordered_items AS");
    expect(migrationSource).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
