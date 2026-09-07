import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907163000_fix_interlaje_futsal_masculino_quarterfinal_participants.sql",
  ),
  "utf8",
);

describe("Interlaje futsal masculino quarterfinal participants migration", () => {
  it("uses corrected points from the qualification pool instead of named teams", () => {
    expect(migration).toContain(
      "public.get_championship_corrected_group_standings(",
    );
    expect(migration).toContain("scored_candidate_rows.corrected_points DESC");
    expect(migration).not.toContain("expected_home_team_names");
    expect(migration).not.toContain("expected_away_team_names");
  });

  it("rebuilds scheduled quarterfinals from the first- and second-place pool", () => {
    expect(migration).toContain("qualification_pool.qualification_rank = 1");
    expect(migration).toContain("qualification_pool.qualification_rank = 2");
    expect(migration).toContain("qualified_team_ids[9 - slot_index]");
    expect(migration).toContain("bracket_matches_table.round_number = 1");
    expect(migration).toContain(
      "first_round_match_record.status IS DISTINCT FROM 'SCHEDULED'::public.match_status",
    );
    expect(migration).toContain(
      "public.sync_championship_bracket_match_participants(first_round_match_record.id)",
    );
  });

  it("derives the confirmed quarterfinal opponents from the corrected ranking", () => {
    const qualifiedTeams = [
      "AAAMU",
      "CAMALEÃO",
      "ENGENIOS",
      "ADIN",
      "UEFA",
      "TAUROS",
      "ATENUN",
      "AACOM",
    ];

    const quarterfinals = [0, 1, 2, 3].map((slotIndex) => [
      qualifiedTeams[slotIndex],
      qualifiedTeams[7 - slotIndex],
    ]);

    expect(quarterfinals).toEqual([
      ["AAAMU", "AACOM"],
      ["CAMALEÃO", "ATENUN"],
      ["ENGENIOS", "TAUROS"],
      ["ADIN", "UEFA"],
    ]);
  });
});
