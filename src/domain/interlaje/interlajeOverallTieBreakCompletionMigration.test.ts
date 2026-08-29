import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260829161000_gate_interlaje_overall_tie_break_until_competitions_finish.sql",
  ),
  "utf8",
);

describe("Interlaje overall tie-break completion migration", () => {
  it("keeps the equalized live points and opening bonus in the general standings", () => {
    expect(migration).toContain(
      "FROM public.get_championship_effective_standings(",
    );
    expect(migration).toContain(
      "FROM public.get_championship_corrected_group_standings(",
    );
    expect(migration).toContain("adjustments_table.adjustment_type = 'OPENING_CEREMONY'");
  });

  it("only exposes an unresolved overall tie after collective and individual competitions settle", () => {
    expect(migration).toContain("championship_is_complete AS");
    expect(migration).toContain("FROM public.matches AS matches_table");
    expect(migration).toContain(
      "matches_table.status != 'FINISHED'::public.match_status",
    );
    expect(migration).toContain(
      "FROM public.championship_individual_sessions AS sessions_table",
    );
    expect(migration).toContain("sessions_table.status NOT IN (");
    expect(migration).toContain(
      "'CANCELLED'::public.championship_individual_session_status",
    );
    expect(migration).toContain(
      "(SELECT championship_is_complete.is_complete FROM championship_is_complete)",
    );
  });
});
