import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260904035448_add_interlaje_volleyball_sets_and_cards.sql",
  ),
  "utf8",
);

describe("Interlaje volleyball rules migration", () => {
  it("habilita cartões e mantém W.O. em dois sets", () => {
    expect(migration).toContain("normalized_championship_sport_name = 'voleibol'");
    expect(migration).toContain("NEW.supports_cards := true");
    expect(migration).toContain("NEW.walkover_winner_set_count := 2");
    expect(migration).toContain("SET supports_cards = true");
    expect(migration).toContain("set_config('app.skip_match_conflict_trigger', 'true', true)");
  });

  it("atribui pontos 3–2–1–0 pelos sets para mandante e visitante", () => {
    expect(migration).toContain("home_score = 2 AND away_score = 0 THEN 3");
    expect(migration).toContain("home_score = 2 AND away_score = 1 THEN 2");
    expect(migration).toContain("home_score = 1 AND away_score = 2 THEN 1");
    expect(migration).toContain("home_score = 0 AND away_score = 2 THEN 3");
  });

  it("rejeita quarto set e placar final fora de 2 × 0 ou 2 × 1", () => {
    expect(migration).toContain("home_sets > 2 OR away_sets > 2");
    expect(migration).toContain("validate_interlaje_volleyball_match_finish");
    expect(migration).toContain("NEW.home_score = 2 AND NEW.away_score IN (0, 1)");
    expect(migration).toContain("NEW.away_score = 2 AND NEW.home_score IN (0, 1)");
  });
});
