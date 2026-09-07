import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907162000_repair_interlaje_futsal_masculino_qualification_pool.sql",
  ),
  "utf8",
);

describe("Interlaje futsal qualification pool repair migration", () => {
  it("orders the best first- and second-placed teams by unrounded corrected points", () => {
    expect(migration).toContain(
      "public.get_championship_corrected_group_standings(",
    );
    expect(migration).toContain(
      "PARTITION BY corrected_candidates.qualification_rank",
    );
    expect(migration).toContain("corrected_candidates.corrected_points DESC");
    expect(migration).not.toContain("round(corrected_candidates.corrected_points");
  });

  it("limits the repair to pending futsal masculino quarterfinals", () => {
    expect(migration).toContain("public.normalize_sport_name(sports_table.name) = 'futsal'");
    expect(migration).toContain(
      "competitions_table.naipe = 'MASCULINO'::public.match_naipe",
    );
    expect(migration).toContain("bracket_matches_table.round_number = 1");
    expect(migration).toContain(
      "first_round_match_record.status IS DISTINCT FROM 'SCHEDULED'::public.match_status",
    );
    expect(migration).toContain(
      "public.sync_championship_bracket_match_participants(first_round_match_record.id)",
    );
  });
});
