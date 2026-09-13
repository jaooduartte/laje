import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260912213811_start_individual_sessions_by_naipe.sql",
  ),
  "utf8",
);

describe("start individual sessions by naipe migration", () => {
  it("starts the selected sessions atomically after validating their shared sport and distinct naipes", () => {
    expect(migration).toContain("start_championship_individual_sessions");
    expect(migration).toContain("requested_sessions_count < 2");
    expect(migration).toContain("sport_count != 1");
    expect(migration).toContain("naipe_count != requested_sessions_count");
    expect(migration).toContain("Todas as sessões precisam estar agendadas");
    expect(migration).toContain("SET status = 'LIVE'::public.championship_individual_session_status");
  });
});
