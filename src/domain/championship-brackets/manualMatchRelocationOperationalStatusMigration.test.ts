import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260830211000_allow_manual_relocation_match_operational_status_transitions.sql",
  ),
  "utf8",
);

describe("manual match relocation operational status migration", () => {
  it("allows operational timing changes during match lifecycle transitions", () => {
    expect(migration).toContain(
      "OLD.status = 'SCHEDULED'::public.match_status AND NEW.status = 'LIVE'::public.match_status",
    );
    expect(migration).toContain(
      "OLD.status = 'LIVE'::public.match_status AND NEW.status = 'FINISHED'::public.match_status",
    );
    expect(migration).toContain(
      "OLD.status = 'FINISHED'::public.match_status AND NEW.status = 'LIVE'::public.match_status",
    );
  });

  it("continues to protect date, court, and queue changes", () => {
    expect(migration).toContain("NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date");
    expect(migration).toContain("NEW.court_name IS DISTINCT FROM OLD.court_name");
    expect(migration).toContain("NEW.queue_position IS DISTINCT FROM OLD.queue_position");
  });
});
