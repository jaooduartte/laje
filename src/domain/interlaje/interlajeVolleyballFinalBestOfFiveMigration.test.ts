import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260919150000_allow_interlaje_volleyball_final_best_of_five.sql",
  ),
  "utf8",
);

describe("Interlaje volleyball final best-of-five migration", () => {
  it("identifica a final principal do mata-mata", () => {
    expect(migration).toContain("bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase");
    expect(migration).toContain("bracket_matches_table.is_third_place = false");
    expect(migration).toContain("bracket_matches_table.next_bracket_match_id IS NULL");
  });

  it("permite até cinco sets e placar final de 3 × 0, 3 × 1 ou 3 × 2", () => {
    expect(migration).toContain("sets_required_to_win := 3");
    expect(migration).toContain("NEW.home_score = 3 AND NEW.away_score IN (0, 1, 2)");
    expect(migration).toContain("NEW.away_score = 3 AND NEW.home_score IN (0, 1, 2)");
  });
});
