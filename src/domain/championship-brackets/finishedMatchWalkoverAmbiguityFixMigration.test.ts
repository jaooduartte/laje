import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260917023000_fix_finished_match_walkover_ambiguity.sql",
  ),
  "utf8",
);

describe("finished match walkover ambiguity fix migration", () => {
  it("uses a distinct PL/pgSQL variable for the walkover loser", () => {
    expect(migration).toContain("v_walkover_loser_team_id UUID");
    expect(migration).toContain(
      "walkover_loser_team_id = v_walkover_loser_team_id",
    );
    expect(migration).not.toContain(
      "walkover_loser_team_id = walkover_loser_team_id",
    );
  });

  it("keeps the existing knockout walkover safeguards and configured set generation", () => {
    expect(migration).toContain(
      "Não é possível aplicar W.O. duplo em jogos do mata-mata.",
    );
    expect(migration).toContain("FROM generate_series(1, winner_set_count)");
    expect(migration).toContain("is_walkover = true");
    expect(migration).toContain("is_double_walkover = false");
  });
});
