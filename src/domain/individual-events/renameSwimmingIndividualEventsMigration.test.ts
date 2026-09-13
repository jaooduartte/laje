import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("rename swimming individual events migration", () => {
  it("keeps the official swimming event names synchronized for existing and future events", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260913210000_rename_swimming_individual_events.sql"),
      "utf8",
    );

    expect(migration).toContain("'SWIMMING_50_FREE', '50m crawl'");
    expect(migration).toContain("'SWIMMING_4X50_FREE', '50m revezamento'");
    expect(migration).toContain("UPDATE public.championship_individual_events");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.sync_championship_individual_events_from_setup");
  });
});
