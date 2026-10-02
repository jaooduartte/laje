import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261002180000_fix_interlaje_disqualified_positions.sql",
  ),
  "utf8",
);

const repository = readFileSync(
  resolve(
    process.cwd(),
    "src/domain/interlaje/interlajeOverallStandings.repository.ts",
  ),
  "utf8",
);

describe("Interlaje disqualified position normalization", () => {
  it("keeps disqualified teams after valid placements without consuming their positions", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_interlaje_regulation_competition_standings_effective",
    );
    expect(migration).toContain("ROW_NUMBER() OVER");
    expect(migration).toContain("base.is_disqualified ASC");
    expect(migration).toContain("base.final_position ASC NULLS LAST");
    expect(migration).toContain(
      "normalized.effective_final_position AS final_position",
    );
  });

  it("recomputes placement points from the compacted final position", () => {
    expect(migration).toContain(
      "normalized.is_disqualified OR normalized.placement_points = 0 THEN 0",
    );
    expect(migration).toContain(
      "position_points.final_position = normalized.effective_final_position",
    );
    expect(migration).toContain(
      "'{placement_context,final_position}'",
    );
  });

  it("feeds the normalized competition standings into the overall classification", () => {
    expect(migration).toContain(
      "CROSS JOIN LATERAL public.get_interlaje_regulation_competition_standings_effective(",
    );
  });

  it("uses the normalized RPC in the competition standings UI", () => {
    expect(repository).toContain(
      '"get_interlaje_regulation_competition_standings_effective"',
    );
  });

  it("does not embed the Interlaje 2026 repair IDs in the reusable rule", () => {
    expect(migration).not.toContain("c7718ca6-4447-4c20-a8ca-5781a34a3778");
    expect(migration).not.toContain("07390767-5365-47fc-994f-336fec558f86");
  });
});
